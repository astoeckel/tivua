#!/usr/bin/env python3

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

################################################################################
# LOGGER                                                                       #
################################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# DATABASE CLASS                                                               #
################################################################################

import sqlite3


class DatabaseKeyValueStore:
    """
    The DatabaseKeyValueStore class provides a key value store on top of a
    SQLite table containing the columns "key" and "value", where "key" is a
    primary key. It implements a persistent dictionary.

    Instances of this class should not be created by the user -- the Database
    class will create such instances as part of its "config" and "cache"
    properties.
    """

    def __init__(self, conn, table):
        """
        Constructor of the DatabaseKeyValueStore class. Copies the given
        parameters.

        @param conn is the database connection
        @param table is the table the DatabaseKeyValueStore should operate on.
        """
        self.conn = conn
        self.table = table

    def lookup(self, key):
        """
        Looks up the given key. Returns the associated value or None if the
        key-value pair does not exist.

        @param key is the key that should be looked up.
        """
        c = self.conn.cursor()
        c.execute("SELECT value FROM {} WHERE key = ?".format(self.table),
                  (key, ))
        res = c.fetchone()
        return None if (res is None) else res[0]

    def __contains__(self, key):
        c = self.conn.cursor()
        c.execute("SELECT 1 FROM {} WHERE key = ?".format(self.table),
                  (key, ))
        return not (c.fetchone() is None)

    def __delitem__(self, key):
        c = self.conn.cursor()
        c.execute("DELETE FROM {} WHERE key = ?".format(self.table),
                  (key, ))
        if c.rowcount == 0:
            raise KeyError(key)
        self.conn.commit()

    def __getitem__(self, key):
        res = self.lookup(key)
        if res is None:
            raise KeyError(key)
        return res

    def __setitem__(self, key, value):
        c = self.conn.cursor()
        c.execute(
            "INSERT INTO {}(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?"
            .format(self.table), (key, value, value))
        self.conn.commit()


class Database:
    """
    The Database class manages the SQLite database in which all Tivua posts and
    user information is stored. The Database object has to be used in
    conjunction with the Python "with" statement; the database will be opened
    upon entering the statement and closed when leaving the statement.
    """

    SQL_TABLES = {
        "posts":
        """CREATE TABLE posts(
            pid INTEGER PRIMARY KEY AUTOINCREMENT,
            id INTEGER,
            revision INTEGER,
            author INTEGER,
            content TEXT,
            date INTEGER,
            ctime INTEGER,
            cuid INTEGER
        )""",
        "keywords":
        """CREATE TABLE keywords(
            keyword TEXT,
            pid INTEGER
        )""",
        "users":
        """CREATE TABLE users(
            uid INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            display_name TEXT,
            role TEXT,
            auth_method TEXT,
            password TEXT,
            last_login INTEGER
        )""",
        "sessions":
        """CREATE TABLE sessions(
            id TEXT PRIMARY KEY,
            uid INTEGER
        )""",
        "cache":
        """CREATE TABLE cache(
            key TEXT PRIMARY KEY,
            value BLOB
        )""",
        "configuration":
        """CREATE TABLE configuration(
            key TEXT PRIMARY KEY,
            value TEXT
        )""",
    }

    def __init__(self, filename):
        """
        Creates the Database object, does not open the database yet -- this can
        only be accomplished by using a Python "with" statement.
        """
        self.filename = filename

    def __enter__(self):
        """
        Opens the database and creates all required tables in case they do not
        exist yet.
        """
        logger.debug("Opening database file \"{}\"".format(self.filename))
        self.conn = sqlite3.connect(self.filename)
        self._create_tables()
        self._initialize_configuration()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Closes the database connection.
        """
        logger.debug("Closing database file \"{}\"".format(self.filename))
        self.conn.close()

    def _create_tables(self):
        """
        Makes sure all tables exists and have the right version. Raises an
        exception if there is a mismatch between the current DB schema and the
        DB schema used in the Database.
        """
        c = self.conn.cursor()
        for table, sql in Database.SQL_TABLES.items():
            c.execute("SELECT sql FROM sqlite_master WHERE tbl_name=?",
                      (table, ))
            res = c.fetchone()
            if res is None:
                logger.debug("Creating table \"{}\"".format(table))
                c.execute(sql)
            elif res[0] != sql:
                raise Exception(
                    ("Table \"{}\" is out of date. Please upgrade to a new " +
                     "database by exporting your current Tivua DB and " +
                     "importing it into a new instance.").format(table))
        self.conn.commit()

    def _initialize_configuration(self):
        """
        Initialises non-existant configuration keys to default values.
        """
        import os

        # Generate the cryptographic salt used to hash passwords
        if not ("salt" in self.config):
            salt = os.urandom(32).hex()
            self.config["salt"] = salt
            logger.info("Initialized password salt to \"{}\"".format(salt))

        # Setup the login methods
        if not ("login_method_username_password" in self.config):
            self.config["login_method_username_password"] = True
        if not ("login_method_cas" in self.config):
            self.config["login_method_cas"] = False

    def get_configuration_object(self):
        c = self.config
        return {
            "login_methods": {
                "username_password": c["login_method_username_password"] == "1",
                "cas": c["login_method_cas"] == "1",
            }
        }

    @property
    def config(self):
        return DatabaseKeyValueStore(self.conn, "configuration")

    @property
    def cache(self):
        return DatabaseKeyValueStore(self.conn, "cache")

    def export_to_json(self):
        # Dumps the database into a JSON serialisable object
        return

    def import_from_json(self):
        # Imports the database from a JSON serialisable object
        return


if __name__ == "__main__":
    """
    Testbed for messing around with the Tivua database
    """
    import sys
    if (len(sys.argv) != 2):
        sys.stderr.write("Usage: {} <SQLITE_FILE>\n".format(sys.argv[0]))
        sys.exit(1)

    logging.basicConfig(
        format='[%(levelname)s] %(message)s', level=logging.DEBUG)
    with Database(sys.argv[1]) as db:
        print(type(db.config["login_method_cas"]))
