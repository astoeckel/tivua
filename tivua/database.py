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

    def __init__(self, db, table):
        """
        Constructor of the DatabaseKeyValueStore class. Copies the given
        parameters.

        @param conn is the database connection
        @param table is the table the DatabaseKeyValueStore should operate on.
        """
        self.db = db
        self.table = table

    def lookup(self, key):
        """
        Looks up the given key. Returns the associated value or None if the
        key-value pair does not exist.

        @param key is the key that should be looked up.
        """
        with Transaction(self.db) as t:
            t.execute("SELECT value FROM {} WHERE key = ?".format(self.table),
                      (key, ))
            return t.fetchone()[0]

    def __contains__(self, key):
        with Transaction(self.db) as t:
            t.execute("SELECT 1 FROM {} WHERE key = ?".format(self.table),
                      (key, ))
            return bool(t.fetchone())

    def __delitem__(self, key):
        with Transaction(self.db) as t:
            t.execute("DELETE FROM {} WHERE key = ?".format(self.table),
                      (key, ))
            if t.rowcount == 0:
                raise KeyError(key)

    def __getitem__(self, key):
        res = self.lookup(key)
        if res is None:
            raise KeyError(key)
        return res

    def __setitem__(self, key, value):
        with Transaction(self.db) as t:
            t.execute(
                "INSERT INTO {}(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?"
                .format(self.table), (key, value, value))


class Transaction:
    """
    The Transaction helper implements nested transactions ontop of the Database
    class. All commands executed within one transaction are atomic, that is
    either the entire transaction is applied, or none of it. This class is
    intended to be used with the "with-resources" statement. In case an
    exception occurs inside of a transaction, the transaction is completely
    rolled back.

    The Transaction class implements part of the Cursor interface.
    """

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
        self.savepoint = "sp_{}".format(self.level)

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
        if exc_type is None:
            self.cursor.execute("RELEASE {}".format(self.savepoint))
        else:
            logger.debug("Rolling back transaction {}".format(self.savepoint))
            self.cursor.execute("ROLLBACK TO {}".format(self.savepoint))

        # Reset the level and cursor variables
        self.level, self.parent, self.savepoint, self.cursor = [None] * 4

    def execute(self, *args, **kwargs):
        return self.cursor.execute(*args, **kwargs)

    def fetchone(self, *args, **kwargs):
        res = self.cursor.fetchone(*args, **kwargs)
        if res is None:
            return Transaction.NoneArray()  # Allow subscripts
        return res

    def fetchall(self, *args, **kwargs):
        return self.cursor.fetchall(*args, **kwargs)

    @property
    def rowcount(self):
        assert not self.cursor is None
        return self.cursor.rowcount

    @property
    def lastrowid(self):
        assert not self.cursor is None
        return self.cursor.lastrowid


class Database:
    """
    The Database class manages the SQLite database in which all Tivua posts and
    user information is stored. The Database object has to be used in
    conjunction with the Python "with" statement; the database will be opened
    upon entering the statement and closed when leaving the statement.
    """

    #
    # Database initialisation
    #

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
            reset_password INTEGER,
            CONSTRAINT unique_name UNIQUE (name)
        )""",
        "sessions":
        """CREATE TABLE sessions(
            sid TEXT PRIMARY KEY,
            uid INTEGER,
            mtime INTEGER
        )""",
        "challenges":
        """CREATE TABLE challenges(
            key TEXT PRIMARY KEY,
            value INTEGER
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
        "settings":
        """CREATE TABLE settings(
            key INT PRIMARY KEY,
            value TEXT
        )""",
    }

    def __init__(self, filename=":memory:"):
        """
        Creates the Database object, does not open the database yet -- this can
        only be accomplished by using a Python "with" statement.

        @param filename is the file in which the data should be stored. This
        parameter defaults to ":memory:", which tells SQLite to write the
        database to volatile memory.
        """
        self.filename = filename
        self.transaction = None

    def __enter__(self):
        """
        Opens the database and creates all required tables in case they do not
        exist yet.
        """
        logger.debug("Opening database file \"{}\"".format(self.filename))

        # Open the database with isolation_level=None, which disables the commit
        # logic of the Python wrapper
        self.conn = sqlite3.connect(self.filename, isolation_level=None)

        # Prepate the database for first-time use
        self._configure_db()
        self._create_tables()
        self._create_functions()

        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Performs some cleanup tasks and closes the database connection.
        """
        logger.debug("Closing database file \"{}\"".format(self.filename))

        # Closes the connection
        self.conn.close()

    def _configure_db(self):
        """
        Configures the SQLite database by issuing a set of PRAGMA statements.
        """
        c = self.conn.cursor()
        c.execute("PRAGMA journal_mode=WAL")

    def _create_tables(self):
        """
        Makes sure all tables exists and have the right version. Raises an
        exception if there is a mismatch between the current DB schema and the
        DB schema used in the Database.
        """
        import re

        c = self.conn.cursor()
        canonicalise_whitespace = re.compile(r"\s+")
        for table, sql in Database.SQL_TABLES.items():
            # Remove superfluous whitespace characters
            sql = canonicalise_whitespace.sub(sql, " ")
            c.execute("SELECT sql FROM sqlite_master WHERE tbl_name=?",
                      (table, ))
            res = c.fetchone()
            if res is None:
                logger.debug("Creating table \"{}\"".format(table))
                c.execute(sql)
            elif canonicalise_whitespace.sub(res[0], " ") != sql:
                raise Exception(
                    ("Table \"{}\" is out of date. Please upgrade to a new " +
                     "database by exporting your current Tivua DB and " +
                     "importing it into a new instance.").format(table))

    @staticmethod
    def now():
        import time
        return int(time.time())

    def _create_functions(self):
        """
        Registers the now() function -- this function returns the current Unix
        timestamp.
        """

        self.conn.create_function("now", 0, Database.now)

    ############################################################################
    # Configuration and cache dictionaries                                     #
    ############################################################################

    @property
    def config(self):
        return DatabaseKeyValueStore(self, "configuration")

    @property
    def settings(self):
        return DatabaseKeyValueStore(self, "settings")

    @property
    def cache(self):
        return DatabaseKeyValueStore(self, "cache")

    @property
    def challenges(self):
        return DatabaseKeyValueStore(self, "challenges")

    ############################################################################
    # Session management                                                       #
    ############################################################################

    def purge_stale_challenges(self, max_age):
        """
        Deletes challenges older than the specified maximum age.
        """
        with Transaction(self) as t:
            t.execute("DELETE FROM challenges WHERE now() - value > ?",
                      (max_age, ))
            return t.rowcount > 0

    def purge_stale_sessions(self, max_age):
        """
        Delete sessions older than the specified maximum age.
        """
        with Transaction(self) as t:
            t.execute("DELETE FROM sessions WHERE now() - mtime > ?",
                      (max_age, ))
            return t.rowcount > 0

    def create_session(self, sid, uid):
        """
        Creates a session for the given user and returns the session identifier.
        """
        with Transaction(self) as t:
            t.execute(
                "INSERT INTO sessions(sid, uid, mtime) VALUES (?, ?, now())",
                (sid, uid))

    def delete_session(self, sid):
        """
        Deletes the session with the given identifier.
        """
        with Transaction(self) as t:
            t.execute("DELETE FROM sessions WHERE sid = ?", (sid, ))
            return t.rowcount > 0

    def update_session_mtime(self, sid):
        """
        Advances the modification time for the given session id.
        """
        with Transaction(self) as t:
            t.execute("UPDATE sessions SET mtime = now() WHERE sid = ?",
                      (sid, ))
            return t.rowcount > 0

    def get_session_uid(self, sid):
        """
        Returns the uid associated with the given session or -1 if the session
        does not exist.
        """
        with Transaction(self) as t:
            t.execute("SELECT uid FROM sessions WHERE sid = ?", (sid, ))
            return t.fetchone()[0]

    ############################################################################
    # User management                                                          #
    ############################################################################

    @staticmethod
    def _make_user_from_tuple(t):
        """
        Helper-function used to convert a user record to a JSON-like object.
        """
        return {
            "uid": t[0],
            "name": t[1],
            "display_name": t[2],
            "role": t[3],
            "auth_method": t[4],
            "password": t[5],
            "reset_password": bool(t[6])
        } if t else None

    def create_user(self,
                    name,
                    display_name,
                    role,
                    auth_method,
                    password="",
                    reset_password=False):
        """
        Creates a new user with the given properties.
        """
        with Transaction(self) as t:
            t.execute(
                """
                INSERT INTO users
                (name, display_name, role, auth_method, password, reset_password)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (name.lower(), display_name, role, auth_method, password,
                 reset_password))
            return t.lastrowid

    def delete_user(self, uid):
        """
        Deletes the user with the given id, returns true if the 
        """
        with Transaction(self) as t:
            t.execute("""DELETE FROM users WHERE uid = ?""", (uid, ))
            return t.rowcount > 0

    def list_users(self):
        """
        Returns a table containing information about all users.
        """
        with Transaction(self) as t:
            t.execute("""SELECT uid, name, display_name, role, auth_method,
                                password, reset_password
                         FROM users ORDER BY uid""")
            return list(map(self._make_user_from_tuple, t.fetchall()))

    def get_user_by_name(self, user_name):
        """
        Returns an object describing the user with the given user_name, or None
        if the user does not exist.
        """
        with Transaction(self) as t:
            t.execute("""SELECT * FROM users WHERE name=? LIMIT 1""",
                      (user_name, ))
            return self._make_user_from_tuple(t.fetchone())

    def get_user_by_id(self, uid):
        """
        Returns an object describing the user with the given uid, or None if the
        user does not exist.
        """

        # Fetch the corresponding row from the DB
        with Transaction(self) as t:
            t.execute("""SELECT * FROM users WHERE uid=? LIMIT 1""",
                      (int(uid), ))
            return self._make_user_from_tuple(t.fetchone())

    ############################################################################
    # Export and import                                                        #
    ############################################################################

    def export_to_json(self):
        # Dumps the database into a JSON serialisable object
        return

    def import_from_json(self):
        # Imports the database from a JSON serialisable object
        return

