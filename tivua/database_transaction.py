#   Tivua -- Shared research blog
#   Copyright (C) 2019  Andreas Stöckel
#
#   This program is free software: you can redistribute it and/or modify
#   it under the terms of the GNU Affero General Public License as
#   published by the Free Software Foundation, either version 3 of the
#   License, or (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU Affero General Public License for more details.
#
#   You should have received a copy of the GNU Affero General Public License
#   along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""
@file database_transaction.py

Defines the Transaction class that operates on a tivua.database.Database
instance.

@author Andreas Stöckel
"""

################################################################################
# LOGGING                                                                      #
###############################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# PUBLIC INTERFACE                                                             #
################################################################################


class Transaction:
    """
    The Transaction helper implements nested transactions ontop of the Database
    class. All commands executed within one transaction are atomic, that is,
    either the entire transaction is applied, or none of it. This class is
    intended to be used with the "with-resources" statement. In case an
    exception occurs inside of a transaction, the transaction is completely
    rolled back.

    The Transaction class implements part of the Cursor interface.
    """

    UID = 0

    class NoneArray:
        def __bool__(self):
            return False

        def __getitem__(self, key):
            return None

    def __init__(self, db):
        self.db = db
        self.cursor = None
        self.level = None
        self.savepoint = None
        self.parent = None

    def __enter__(self):
        # Make sure we do not double-enter the same transaction object
        assert self.cursor is None

        # If there is another transaction active at the moment, inherit the
        # level from that transaction
        if self.db.transaction:
            self.level = self.db.transaction.level + 1
            self.parent = self.db.transaction
        else:
            self.level = 0
            self.parent = None

        # Set this transaction as the current transaction
        self.db.transaction = self

        # Create a unique savepoint name
        Transaction.UID += 1
        self.savepoint = "sp_{:x}_{}".format(Transaction.UID, self.level)

        # Start a new sqlite transaction
        self.cursor = self.db.conn.cursor()
        self.cursor.execute("SAVEPOINT {}".format(self.savepoint))

        return self

    def __exit__(self, exc_type, exc_value, traceback):
        # Make sure we actually entered the transaction
        assert not self.cursor is None

        # Reset the transaction object
        self.db.transaction = self.parent

        # Either rollback or commit the transaction, depending on whether
        # there was an exception
        if not exc_type is None:
            self.cursor.execute("ROLLBACK TO {}".format(self.savepoint))
        self.cursor.execute("RELEASE {}".format(self.savepoint))

        # Reset the level and cursor variables
        self.level, self.parent, self.savepoint, self.cursor = [None] * 4

    def execute(self, *args, **kwargs):
        return self.cursor.execute(*args, **kwargs)

    def fetchone(self, *args, **kwargs):
        res = self.cursor.fetchone(*args, **kwargs)
        if res is None:
            return Transaction.NoneArray()  # Allow subscripts
        return res

    def fetchone_dataclass(self, D, *args, **kwargs):
        res = self.cursor.fetchone(*args, **kwargs)
        return None if res is None else D(*res)

    def fetchall(self, *args, **kwargs):
        return self.cursor.fetchall(*args, **kwargs)

    def fetchall_dataclass(self, D, *args, **kwargs):
        return list(
            map(lambda x: D(*x), self.cursor.fetchall(*args, **kwargs)))

    @property
    def rowcount(self):
        assert not self.cursor is None
        return self.cursor.rowcount

    @property
    def lastrowid(self):
        assert not self.cursor is None
        return self.cursor.lastrowid

