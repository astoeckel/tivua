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
@file database.py

Provides the Database class, an abstraction over the underlying database system.
The Database class is purely a data store, it does not perform any validation
of the given data. Furthermore, some operations have to be split into multiple
database calls. These operations are performed by the API class.

@author Andreas Stöckel
"""

# Import 
from tivua.database_dictionary import make_database_dict_class
from tivua.database_transaction import Transaction

################################################################################
# LOGGING                                                                      #
################################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# DATA CLASSES                                                                 #
################################################################################

from dataclasses import dataclass, asdict, astuple

@dataclass(order=True)
class Post:
    pid: int = None
    revision: int = 0
    author: int = None
    content: str = ""
    keywords: str = ""
    date: int = None
    ctime: int = None
    cuid: int = None
    mtime: int = None
    muid: int = None


@dataclass(order=True)
class User:
    uid: int = None
    name: str = None
    display_name: str = None
    role: str = "inactive"
    auth_method: str = "password"
    password: str = "0000000000000000000000000000000000000000000000000000000000000000"
    reset_password: bool = True


################################################################################
# DATABASE CLASS                                                               #
################################################################################

class SchemaOutOfDateError(RuntimeError):
    pass

class Database:
    """
    The Database class manages the SQLite database in which all Tivua posts and
    user information is stored. The Database object has to be used in
    conjunction with the Python "with" statement; the database will be opened
    upon entering the statement and closed when leaving the statement.

    This class does not perform (much) validation of the given data, and some
    of these operations on their own may negatively impact the consistency of
    the data (e.g., adding posts without also updating the keywords table). Use
    the functions in the API class instead of directly calling Database methods.
    """

    #
    # Database initialisation
    #

    SQL_TABLES = {
        "posts":
        """CREATE TABLE posts(
            pid INTEGER PRIMARY KEY AUTOINCREMENT,
            revision INTEGER,
            author INTEGER,
            content TEXT,
            keywords TEXT,
            date INTEGER,
            ctime INTEGER,
            cuid INTEGER,
            mtime INTEGER,
            muid INTEGER
        )""",
        "posts_history":
        """CREATE TABLE posts_history(
            pid INTEGER,
            revision INTEGER,
            author INTEGER,
            content TEXT,
            keywords TEXT,
            date INTEGER,
            ctime INTEGER,
            cuid INTEGER,
            mtime INTEGER,
            muid INTEGER,
            CONSTRAINT unique_pid_rev UNIQUE (pid, revision)
        )""",
        "keywords":
        """CREATE TABLE keywords(
            keyword TEXT,
            pid INTEGER,
            CONSTRAINT unique_keyword_pid UNIQUE (keyword, pid)
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
            challenge TEXT PRIMARY KEY,
            ctime INTEGER
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
            uid INT PRIMARY KEY,
            obj TEXT
        )""",
    }

    # Dictionary type used to store keywords. This is a special dictionary type
    # that assigns a set
    KeywordsDict = make_database_dict_class("keywords", "keyword", "pid", True)
    ChallengesDict = make_database_dict_class("challenges", "challenge", "ctime")
    CacheDict = make_database_dict_class("cache")
    ConfigurationDict = make_database_dict_class("configuration")
    SettingsDict = make_database_dict_class("settings", "uid", "obj")

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
        self.conn = None

    def __enter__(self):
        """
        Opens the database and creates all required tables in case they do not
        exist yet.
        """
        logger.debug("Opening database file \"{}\"".format(self.filename))

        # Open the database with isolation_level=None, which disables the commit
        # logic of the Python wrapper
        import sqlite3
        self.conn = sqlite3.connect(self.filename, isolation_level=None)

        # Prepate the database for first-time use
        self._configure_db()
        self._create_tables()
        self._create_indices()
        self._create_functions()

        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Performs some cleanup tasks and closes the database connection.
        """
        logger.debug("Closing database file \"{}\"".format(self.filename))

        # Closes the connection
        self.conn.close()
        self.conn = None

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
                raise SchemaOutOfDateError(
                    ("Table \"{}\" is out of date. Please upgrade to a new " +
                     "database by exporting your current database using the " +
                     "old Tivua version and then importing the backup into a " +
                     "new instance.").format(table))

    def _create_indices(self):
        """
        Creates all indices required for efficient operation of the database.
        """
        with Transaction(self) as t:
            t.execute(
                """CREATE INDEX IF NOT EXISTS posts_date_index ON posts(date DESC)"""
            )
            t.execute(
                """CREATE INDEX IF NOT EXISTS posts_pid_index ON posts(pid)""")
            t.execute(
                """CREATE INDEX IF NOT EXISTS keywords_keyword_index ON keywords(keyword ASC)"""
            )

    @property
    def open(self):
        return self.conn != None

    @staticmethod
    def now():
        """
        Returns an integer corresponding to the current Unix timestamp.
        """
        import time
        return int(time.time())

    @staticmethod
    def today():
        """
        Returns a Unix timestamp corresponding to noon, today, in UTC.
        """
        from datetime import date, datetime, timezone

        # Fetch today's date
        today = date.today()

        # Create a new UNIX timestamp pointing at the same date as today, but
        # at noon, UTC.
        return int(
            datetime(
                today.year,
                today.month,
                today.day,
                12,
                0,
                0,
                0,
                tzinfo=timezone.utc).timestamp())

    def _create_functions(self):
        """
        Registers the now() function -- this function returns the current Unix
        timestamp.
        """

        self.conn.create_function("now", 0, Database.now)

    def purge(self):
        """
        Resets the database to its initial state, deleting everything.
        """
        with Transaction(self) as t:
            for table in Database.SQL_TABLES.keys():
                t.execute("""DELETE FROM {}""".format(table))

    ############################################################################
    # Key-value stores                                                         #
    ############################################################################

    @property
    def keywords(self):
        return Database.KeywordsDict(self)

    @property
    def challenges(self):
        return Database.ChallengesDict(self)

    @property
    def cache(self):
        return Database.CacheDict(self)

    @property
    def configuration(self):
        return Database.ConfigurationDict(self)

    @property
    def settings(self):
        return Database.SettingsDict(self)

    ############################################################################
    # Challenges management                                                    #
    ############################################################################

    def purge_stale_challenges(self, max_age):
        """
        Deletes challenges older than the specified maximum age.
        """
        with Transaction(self) as t:
            t.execute("DELETE FROM challenges WHERE now() - ctime > ?",
                      (max_age, ))
            return t.rowcount > 0

    ############################################################################
    # Session management                                                       #
    ############################################################################

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

    def create_user(self, user):
        """
        Creates a new user with the given properties.
        """
        with Transaction(self) as t:
            t.execute(
                """
                INSERT INTO users
                (uid, name, display_name, role, auth_method, password, reset_password)
                VALUES (?, ?, ?, ?, ?, ?, ?)""", astuple(user))
            return t.lastrowid

    def update_user(self, user):
        with Transaction(self) as t:
            # Convert the user to a tuple
            user = astuple(user)

            # Update the user row
            t.execute(
                """
                UPDATE users SET name=?, display_name=?, role=?, auth_method=?,
                                 password=?, reset_password=?
                             WHERE uid=?""", user[1:] + (user[0],))
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
            return t.fetchall_dataclass(User)

    def get_user_by_name(self, user_name):
        """
        Returns an object describing the user with the given user_name, or None
        if the user does not exist.
        """
        with Transaction(self) as t:
            t.execute("""SELECT * FROM users WHERE name=? LIMIT 1""",
                      (user_name, ))
            return t.fetchone_dataclass(User)

    def get_user_by_id(self, uid):
        """
        Returns an object describing the user with the given uid, or None if the
        user does not exist.
        """

        # Fetch the corresponding row from the DB
        with Transaction(self) as t:
            t.execute("""SELECT * FROM users WHERE uid=? LIMIT 1""",
                      (int(uid), ))
            return t.fetchone_dataclass(User)

    ############################################################################
    # Posts                                                                    #
    ############################################################################

    def list_posts(self, start=0, limit=-1, history=False):
        """
        Lists the newest revision of each post, ordered by date.
        """
        with Transaction(self) as t:
            table = "posts_history" if history else "posts"
            t.execute(
                """SELECT * FROM {} ORDER BY date DESC
                   LIMIT ? OFFSET ?""".format(table), (limit, start))
            return t.fetchall_dataclass(Post)

    def create_post(self, post, history=False):
        with Transaction(self) as t:
            table = "posts_history" if history else "posts"
            t.execute(
            """INSERT INTO {}(pid, revision, author, content, keywords,
                              date, ctime, cuid, mtime, muid)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".format(table), astuple(post))
            return t.lastrowid

    def delete_post(self, pid, history=False):
        with Transaction(self) as t:
            table = "posts_history" if history else "posts"
            t.execute("""DELETE FROM {} WHERE pid=?""".format(table), (pid,))
            return t.lastrowid

    def update_post(self, post, history=False):
        with Transaction(self) as t:
            # Convert the post to a tuple
            post = astuple(post)

            # Select the correct target table
            table = "posts_history" if history else "posts"

            # Execute the update
            t.execute(
            """UPDATE {} SET revision=?, author=?, content=?, keywords=?,
                             date=?, ctime=?, cuid=?, mtime=?, muid=?
               WHERE pid=?""".format(table), post[1:] + (post[0],))
            return t.rowcount > 0

    def get_post(self, pid):
        """
        Returns the post with the given pid.
        """
        with Transaction(self) as t:
            t.execute("""SELECT * FROM posts WHERE pid = ? LIMIT 1""", (pid, ))
            return t.fetchone_dataclass(Post)

    def total_post_count(self):
        """
        Counts the total number of posts of a certain id.
        """
        with Transaction(self) as t:
            t.execute("""SELECT COUNT() FROM posts""")
            return t.fetchone()[0]


################################################################################
# EXPORTS                                                                      #
################################################################################

__all__ = ["Transaction", "Database", "User", "Post"]

