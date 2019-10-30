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

import os
import re
import sqlite3
import time


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
        c.execute("SELECT 1 FROM {} WHERE key = ?".format(self.table), (key, ))
        return not (c.fetchone() is None)

    def __delitem__(self, key):
        c = self.conn.cursor()
        c.execute("DELETE FROM {} WHERE key = ?".format(self.table), (key, ))
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
            id TEXT PRIMARY KEY,
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
        self._configure_db()
        self._create_tables()
        self._create_configuration()
        self._create_initial_user()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Closes the database connection.
        """
        logger.debug("Closing database file \"{}\"".format(self.filename))
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
        self.conn.commit()

    def _create_configuration(self):
        """
        Initialises non-existent configuration keys to default values.
        """
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

    def _create_initial_user(self):
        """
        If there are no users, administrating Tivua becomes somewhat hard.
        Correspondingly, Tivua creates an empty admin user account the first
        time the database is initialised.
        """
        if len(self.list_users()) == 0:
            # Create a random password and print it to the log
            password = self.create_random_password()
            logger.warning(
                "No user found; created new user \"admin\" with password \"{}\""
                .format(password))

            # Actually create the user
            self.create_user(
                name='admin',
                display_name='Admin',
                role='admin',
                auth_method='password',
                password=self.hash_password(password),
                reset_password=True)

    #
    # Configuration and cache dictionaries
    #

    def get_configuration_object(self):
        """
        Returns a JSON serialisable object containing the global configuration
        options.
        """

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
    def settings(self):
        return DatabaseKeyValueStore(self.conn, "settings")

    @property
    def cache(self):
        return DatabaseKeyValueStore(self.conn, "cache")

    @property
    def challenges(self):
        return DatabaseKeyValueStore(self.conn, "challenges")

    ############################################################################
    # Session management                                                       #
    ############################################################################

    # Number of iterations in the PBKDF2 HMAC algorithm
    PBKDF2_COUNT = 10000

    # Timeout for a challenge to expire in seconds. This should be fairly small;
    # challenges are usually requested by the client directly before sending
    # the login request.
    CHALLENGE_TIMEOUT = 60  # one minute timeout for actually using a challenge

    # Sessions time out when not used for a while. Forces users to login again
    # after the given time has expired.
    SESSION_TIMEOUT = 15 * 24 * 60 * 60

    def hash_password(self, password, salt=None):
        """
        Computes the hashed password using PBKDF2 and the salt stored in the
        database.

        @param password is the password the should be hashed. May either be a
               bytes object, or a string -- strings are encoded as utf-8
        @param salt if None, the salt is looked up from the database, otherwise
               the specified hex-string is used.
        @return a hex-string containing the hashed password.
        """
        import hashlib
        if isinstance(password, str):
            password = password.encode("utf-8")
        if salt is None:
            salt = self.config["salt"]
        return hashlib.pbkdf2_hmac("sha256", password, bytes.fromhex(salt),
                                   Database.PBKDF2_COUNT).hex()

    def get_login_challenge(self):
        """
        Creates a login challenge and returns an object containing both the
        challenge and the salt.
        """

        # Fetch the current UNIX time and create a random challenge
        now = int(time.time())
        challenge = os.urandom(32).hex()

        # Store the challenge and its creation time in the database
        self.challenges[challenge] = now

        # Purge old login challenges
        c = self.conn.cursor()
        c.execute("DELETE FROM challenges WHERE value < ?",
                  (now - Database.CHALLENGE_TIMEOUT, ))
        self.conn.commit()

        # Return a challenge object ready to be sent to the client
        return {"salt": self.config["salt"], "challenge": challenge}

    def check_login_challenge(self, challenge):
        """
        Returns True and deletes the given challenge if it existed, returns
        False if the challenge is invalid (i.e. too old).
        """

        # Fetch the current time in seconds
        now = int(time.time())

        # Check whether the callenge exists
        if not challenge in self.challenges:
            return False

        # Fetch the challenge creation time
        ctime = self.challenges[challenge]

        # Delete the challenge
        del self.challenges[challenge]

        # Return True if the challenge was valid
        return (now - ctime) < Database.CHALLENGE_TIMEOUT

    def create_session(self, user_id):
        """
        Creates a session for the given user and returns the session identifier.
        """

        # Create a random session id
        now = int(time.time())
        session = os.urandom(32).hex()

        # Create a cursor and create the session table entry
        c = self.conn.cursor()
        c.execute("INSERT INTO sessions(id, uid, mtime) VALUES (?, ?, ?)",
                  (session, user_id, now))
        self.conn.commit()

        return session

    def get_session_data(self, session):
        """
        Provides session information for the given session.
        """

        # Purge old sessions from the session table
        c = self.conn.cursor()
        now = int(time.time())
        c.execute("DELETE FROM sessions WHERE mtime < ?",
                  (now - Database.SESSION_TIMEOUT, ))
        self.conn.commit()

        # Lookup the session from the session table
        c = self.conn.cursor()
        c.execute("SELECT uid FROM sessions WHERE id = ? LIMIT 1", (session, ))
        res = c.fetchone()
        if res is None:
            return None

        # Fetch the user data for the given session, add the session information
        user = self.get_user_by_id(res[0])
        if user is None:
            return None

        # The session was acquired successfully, advance the session time
        c = self.conn.cursor()
        c.execute("UPDATE sessions SET mtime = ? WHERE id = ?", (now, session))
        self.conn.commit()

        # Return the session object
        return {
            "session": session,
            "user_id": res[0],
            "user_name": user["name"],
            "display_name": user["display_name"],
            "role": user["role"],
            "reset_password": user["reset_password"]
        }

    def delete_session(self, session):
        """
        Deletes the session with the given identifier.
        """
        c = self.conn.cursor()
        c.execute("DELETE FROM sessions WHERE id = ?", (session, ))
        if c.rowcount == 0:
            return False
        self.conn.commit()
        return True

    #
    # User management
    #

    @staticmethod
    def _make_user_from_tuple(t):
        return {
            "id": t[0],
            "name": t[1],
            "display_name": t[2],
            "role": t[3],
            "auth_method": t[4],
            "password": t[5],
            "reset_password": bool(t[6])
        }

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
        c = self.conn.cursor()
        c.execute(
            """
            INSERT INTO users
            (name, display_name, role, auth_method, password, reset_password)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (name.lower(), display_name, role, auth_method, password,
             reset_password))
        self.conn.commit()
        return c.lastrowid

    def list_users(self):
        """
        Returns a table containing information about all users.
        """
        c = self.conn.cursor()
        c.execute("""SELECT uid, name, display_name, role, auth_method,
                            password, reset_password
                     FROM users""")
        return list(map(self._make_user_from_tuple, c.fetchall()))

    def get_user_by_name(self, user_name):
        """
        Returns an object describing the user with the given user_name, or None
        if the user does not exist.
        """

        # Fetch the corresponding row from the DB
        c = self.conn.cursor()
        c.execute(
            """SELECT uid, name, display_name, role, auth_method,
                            password, reset_password
                     FROM users WHERE name=? LIMIT 1""", (user_name.lower(), ))
        res = c.fetchone()
        return None if (res is None) else self._make_user_from_tuple(res)

    def get_user_by_id(self, uid):
        """
        Returns an object describing the user with the given uid, or None if the
        user does not exist.
        """

        # Fetch the corresponding row from the DB
        c = self.conn.cursor()
        c.execute(
            """SELECT uid, name, display_name, role, auth_method,
                            password, reset_password
                     FROM users WHERE uid=? LIMIT 1""", (int(uid), ))
        res = c.fetchone()
        return None if (res is None) else self._make_user_from_tuple(res)

    @staticmethod
    def create_random_password(n=10):
        """
        Creates a random password. Eliminates modulo bias by reading multiple
        bytes from the random source at once.
        """
        alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"
        password = [" "] * n
        accu, mul = 0, 16
        for i, r in enumerate(os.urandom(mul * n)):
            if i % mul == mul - 1:
                password[i // mul] = alphabet[accu % len(alphabet)]
                accu = 0
            else:
                accu = (accu << 8) + r
        return "".join(password)

    #
    # Export and import
    #

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
        #        print(db.create_user(
        #                    name="admin",
        #                    display_name="Admin",
        #                    role="admin",
        #                    auth_method="password",
        #                    password="foo",
        #                    reset_password=True))
        print(db.list_users())

