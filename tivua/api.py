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
@file api.py

Contains the bussiness logic of Tivua -- receives calls from the HTTP server or
the CLI applications and translates them into corresponding database calls.
The API layer validates calls for correctness, but does not check for
permissions, this has to be done by the caller.

@author Andreas Stöckel
"""

################################################################################
# LOGGING                                                                      #
################################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# PUBLIC INTERFACE                                                             #
################################################################################

import re, os, json
from dataclasses import astuple, asdict

from tivua.database import Transaction, Post, User
from tivua.database_filters import FilterUID, FilterAuthor


class ValidationError(ValueError):
    """
    Exception raised whenever a user-provided value could not be validated.
    """


class AuthentificationError(RuntimeError):
    """
    Exception raised whenever a user does not have sufficient authorisation to
    perform an action.
    """


class NotFoundError(RuntimeError):
    """
    Exception raised if all parameters given to an action validated correctly,
    but something is referring to a non-existing object.
    """


class ConflictError(RuntimeError):
    """
    Exception raised if an update/create operation results in a conflict, such
    as a duplicate id or an update of an already updated entry.
    """


class Perms:
    """
    Class containing constants representing individual permissions.
    """

    # Permission indicating that either no permissions are required or that the
    # user does not have any permissions (is inactive)
    NONE = 0

    # Permission indicating that the user must be able to read to perform this
    # action
    CAN_READ = 1

    # Permission indicating that the user must be able to write to perform this
    # action
    CAN_WRITE = 2

    # Permission indicating that the user has/must have special admin rights
    # to be# able to perform this action
    CAN_ADMIN = 4

    # List of user roles
    USER_ROLES = {
        # Inactive users cannot login. Users should be marked as "inactive"
        # instead of deleting them to preserve their posts.
        "inactive": NONE,

        # A "reader" is not able to create or edit any posts, but may still
        # read them.
        "reader": CAN_READ,

        # A author user can both read and write posts.
        "author": CAN_READ | CAN_WRITE,

        # A admin user can read, write and administrate a Tivua instance.
        "admin": CAN_READ | CAN_WRITE | CAN_ADMIN,
    }

    @staticmethod
    def is_valid_role(role):
        return role in list(Perms.USER_ROLES.keys())

    @staticmethod
    def lookup_role_permissions(role):
        """
        Converts a "role" string into a set of permissions.
        """
        if not role in Perms.USER_ROLES:
            return Perms.NONE
        return Perms.USER_ROLES[role]

    @staticmethod
    def role_has_permission(role, permission):
        return (Perms.lookup_role_permissions(role) & permission) == permission


class API:
    ############################################################################
    # Initialization                                                           #
    ############################################################################

    def __init__(self, db, perform_initialisation=True):
        """
        Creates a new API instances connected to the given Database. If
        `perform_initialisation` is set to True, makes sure that there is at
        least one user and that all configuration options exist.
        """
        self.db = db
        self.perform_initialisation = perform_initialisation
        self._init()

    def __enter__(self):
        """
        Opens the underlying database.
        """
        self.db.__enter__()
        self._init()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Closes the underlying database
        """
        self.db.__exit__(exc_type, exc_value, traceback)

    def _init(self):
        if self.db.open and self.perform_initialisation:
            with Transaction(self.db):
                self._init_configuration()
                self._init_users()
            self.perform_initialisation = False

    def _init_configuration(self):
        """
        Initialises non-existent configuration keys to default values.
        """
        # Fetch the config dict
        config = self.db.configuration

        # Generate the cryptographic salt used to hash passwords
        if not ("salt" in config):
            salt = os.urandom(32).hex()
            config["salt"] = salt
            logger.warning("Initialized password salt to \"%s\"", salt)

        # Setup the login methods
        if not ("login_method_username_password" in config):
            config["login_method_username_password"] = True
        if not ("login_method_cas" in config):
            config["login_method_cas"] = False

    def _init_users(self):
        """
        If there is no administrative user, creates one. An administrative user
        is a user that has administrative rights or is named "admin". The latter
        rule is added in such that the auto-generated admin user can be
        explicitly deactivated.
        """

        # Try to find a user with administrative rights or user named "admin"
        # that has a valid password set
        admin_user = None
        for user in self.db.list_users():
            if (user.name == "admin" or user.role == "admin"):
                admin_user = user
                break

        # Abort if the admin user has a valid password
        empty_password = "0" * 64
        if admin_user and admin_user.password != empty_password:
            return

        # Create a random password
        password = self.create_random_password()
        password_hash = self._hash_password(password)

        # Print a log message
        if admin_user:
            admin_user.password = password_hash
            admin_user.reset_password = True
            logger.warning(
                "Reset password for user account \"%s\"; new password is \"%s\"",
                admin_user.name, password)
        else:
            logger.warning(
                "No admin user found; created new user \"admin\" with password \"%s\"",
                password)

        # Create a new user if no user exists
        if not admin_user:
            admin_user = User(name='admin',
                              display_name='Admin',
                              role='admin',
                              auth_method='password',
                              password=password_hash,
                              reset_password=True)

        # Update/create the user
        if admin_user.uid is None:
            self.db.create_user(admin_user)
        else:
            self.db.update_user(admin_user)

    ############################################################################
    # Helper functions                                                         #
    ############################################################################

    @staticmethod
    def _is_type_or_none(o, type_):
        """
        Makes sure the given object o is either None or of the given type.
        """
        if o is None:
            return True
        elif isinstance(o, type_):
            return True
        elif (type_ is bool) and type(o) is int:
            return True  # Allow conversion from int -> bool
        else:
            return False

    @staticmethod
    def _dataclass_from_dict(D, x):
        """
        Instantiates the given dataclass "D" from a dictionary "x".
        In particular, only passes the keys in "x" to the data class constructor
        that are also valid fields in the dataclass.
        """
        keys = set(D.__dataclass_fields__.keys()) & set(x.keys())
        return D(**{key: x[key] for key in keys})

    @staticmethod
    def _dataclass_check_types(o):
        for name, field in o.__dataclass_fields__.items():
            if not API._is_type_or_none(getattr(o, name), field.type):
                logger.debug("Expected {} but got {}".format(
                    str(field.type), type(getattr(o, name))))
                raise ValidationError("%server_error_invalid_type")

    ############################################################################
    # Configuration                                                            #
    ############################################################################

    def get_configuration_object(self):
        """
        Returns a JSON serialisable object containing the global configuration
        options.
        """
        with Transaction(self.db):
            c = self.db.configuration
            return {
                "login_methods": {
                    "username_password":
                    c["login_method_username_password"] == "1",
                    "cas": c["login_method_cas"] == "1",
                },
                "salt": c["salt"],
            }

    ############################################################################
    # Cryptographic utilities                                                  #
    ############################################################################

    # Regular expression used to check that an identifier corresponds to a
    # 32-byte (64 characters, 256 bits) hex string
    HEX64_RE = re.compile("^[a-f0-9]{64}$")

    # Number of iterations in the PBKDF2 HMAC algorithm
    PBKDF2_COUNT = 10000

    def _hash_password(self, password, salt=None):
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
            salt = self.db.configuration["salt"]
        if isinstance(salt, str):
            if not API.HEX64_RE.match(salt):
                raise ValidationError()
            salt = bytes.fromhex(salt)
        if isinstance(salt, bytes) and len(salt) != 32:
            raise ValidationError()

        return hashlib.pbkdf2_hmac("sha256", password, salt,
                                   API.PBKDF2_COUNT).hex()

    @staticmethod
    def create_random_password(n=10):
        """
        Creates a random password. Eliminates modulo bias by reading multiple
        bytes from the random source at once. Uses a limited alphabet that
        ensures not using letters that are easy to confuse and that are on
        different locations on QWERTZ vs QWERTY keyboards (sorry, AZERTY users).

        @param n is the number of characters in the password.
        """
        alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXabcdefghijkmnpqrstuvwx"
        password = [" "] * n
        accu, mul = 0, 16
        for i, r in enumerate(os.urandom(mul * n)):
            if i % mul == mul - 1:
                password[i // mul] = alphabet[accu % len(alphabet)]
                accu = 0
            else:
                accu = (accu << 8) + r
        return "".join(password)

    ############################################################################
    # Session management                                                       #
    ############################################################################

    # Sessions time out when not used for a while. Forces users to login again
    # after the given time has expired.
    SESSION_TIMEOUT = 15 * 24 * 60 * 60

    # Timeout for a challenge to expire in seconds. This should be fairly small;
    # challenges are usually requested by the client directly before sending
    # the login request.
    CHALLENGE_TIMEOUT = 60  # one minute timeout for actually using a challenge

    # Regular expression describing a valid user name
    USER_RE = re.compile("^[a-z0-9._-]{2,16}$")

    def get_password_login_challenge(self):
        """
        Creates a login challenge and returns an object containing both the
        challenge and the salt.
        """

        with Transaction(self.db):
            # Fetch the current UNIX time and create a random challenge
            challenge = os.urandom(32).hex()

            # Delete old challenges
            self.db.purge_stale_challenges(API.CHALLENGE_TIMEOUT)

            # Store the challenge and its creation time in the database
            self.db.challenges[challenge] = self.db.now()

            # Return a challenge object ready to be sent to the client
            return {
                "salt": self.db.configuration["salt"],
                "challenge": challenge
            }

    def _check_password_login_challenge(self, challenge):
        """
        Used internally. Returns True and deletes the given challenge if it
        existed, returns
        False if the challenge is invalid (i.e. too old).
        """

        with Transaction(self.db):
            # Delete stale challenges
            self.db.purge_stale_challenges(API.CHALLENGE_TIMEOUT)

            # Check whether the callenge exists
            if not challenge in self.db.challenges:
                return False

            # Delete the challenge
            del self.db.challenges[challenge]

            return True

    def _login_method_username_password(self, user_name, challenge, response):
        """
        Internal implementation of the _login_method_username_password function.
        """

        # Make sure the user name, challenge, and response are of the
        # correct format
        user_name = str(user_name).strip().lower()
        challenge, response = str(challenge), str(response)
        if not (API.USER_RE.match(user_name) and API.HEX64_RE.match(challenge)
                and API.HEX64_RE.match(response)):
            raise ValidationError()

        # Make sure the valid is valid (do this outside of the transaction
        # below to avoid purged sessions being rolled back.
        if not self._check_password_login_challenge(challenge):
            raise AuthentificationError()

        # Lookup the user, check the user role and compute the expected response
        with Transaction(self.db):
            # Make sure the user exists. If the user name does not exist, raise
            # an authentification error, i.e. do not expose the users'
            # non-existance to the client
            user = self.db.get_user_by_name(user_name)
            if user is None:
                raise AuthentificationError()

            # Make sure the user can actually login using a password
            if user.auth_method != "password":
                raise AuthentificationError()

            # Make sure the user has the right permissions
            if Perms.lookup_role_permissions(user.role) <= 0:
                raise AuthentificationError()

            # Compute the expected password hash
            expected_response = self._hash_password(
                bytes.fromhex(user.password), challenge)
            if expected_response != response:
                raise AuthentificationError()

            # Okay, all this worked. Let's create a session for the user and
            # return the sid
            sid = os.urandom(32).hex()
            self.db.create_session(sid, user.uid)
            return self.get_session_data(sid)

    # Login should be a constant time function -- otherwise we're leaking
    # information about whether a user exists or not (because checking the
    # challenge response is really slow).
    LOGIN_CONSTANT_TIME = 50e-3  # Always use 50ms

    def login_method_username_password(self, user_name, challenge, response):
        """
        Checks whether an attempted password login is valid, and, if yes,
        creates a new session for the user. Returns the created session id or
        "None" in case the login did not work.

        @param user_name is the name the user tried to login with.
        @param challenge is the challenge string issued to the user.
        @param response is the challenge response generated by the user.
        """

        # Avoid leaking information by making this a constant-time function
        import time
        try:
            begin = time.time()
            return self._login_method_username_password(
                user_name, challenge, response)
        finally:
            end = time.time()
            time.sleep(
                max(
                    0.0,
                    min(API.LOGIN_CONSTANT_TIME,
                        API.LOGIN_CONSTANT_TIME - (end - begin))))

    def logout(self, sid):
        """
        Simply deletes the given session identifier from the DB.
        """
        if not API.HEX64_RE.match(sid):
            raise ValidationError()
        self.db.delete_session(sid)

    def get_session_data(self, sid):
        """
        Returns the session data. Returns None if the given session is not
        available or invalid. Updates the session mtime in order to re-validate
        the session. The session data is an object containing the following elements:

            {
                "sid": <the session id>,
                "uid": <the numerical user id>,
                "name": <the canonical user name>,
                "display_name": <the user-defined display name>,
                "role": <the user role string>,
                "reset_password": <true if the user must reset the password>,
            }

        """

        # Validate the session identifier
        if not API.HEX64_RE.match(sid):
            raise ValidationError()

        # Remove any stale sessions, then try to fetch the user data associated
        # with the session
        self.db.purge_stale_sessions(API.SESSION_TIMEOUT)
        with Transaction(self.db):
            # Fetch the UID corresponding to the session
            uid = self.db.get_session_uid(sid)
            if not uid:
                return None

            # Advance the session mtime
            self.db.update_session_mtime(sid)

            # Get the user data associated with the UID
            user = self.db.get_user_by_id(uid)
            return {
                "sid": sid,
                "uid": uid,
                "name": user.name,
                "display_name": user.display_name,
                "role": user.role,
                "reset_password": user.reset_password,
            }

    ############################################################################
    # User settings                                                            #
    ############################################################################

    # Maximum number of characters in the settings string; this prevents users
    # from storing arbitrary data in the session.
    MAX_SETTINGS_LEN = 1024

    def get_user_settings(self, uid):
        """
        Reads the user settings from the database and serialises them into a
        JSON object. Returns an empty object if the user has not stored any
        settings yet.
        """
        with Transaction(self.db):
            if (uid in self.db.settings):
                return json.loads(self.db.settings[uid])
            return {}

    def update_user_settings(self, uid, settings):
        """
        Merges the currently stored settings with the given settings object.
        Returns the updated settings object.
        """

        # TODO: Provide method to not update the settings, as currently an
        # ill-behaving client has no chance to remove setting keys.

        # Make sure the "settings" object is a dictionary
        if not isinstance(settings, dict):
            raise ValidationError()

        # Perform the update
        with Transaction(self.db):
            # Merge the new settings with the old values
            if (uid in self.db.settings):
                for key, value in json.loads(self.db.settings[uid]).items():
                    if not key in settings:
                        settings[key] = value

            # Serialise the settings to a string
            settings_str = json.dumps(settings, sort_keys=True)
            if len(settings_str) > API.MAX_SETTINGS_LEN:
                raise ValidationError()

            # Store the merged values in the database
            self.db.settings[uid] = settings_str
            return settings

    ############################################################################
    # Posts and keywords                                                       #
    ############################################################################

    # Minimum length of a single keyword
    KEYWORDS_MIN_LEN = 2

    # Maximum length of a single keyword
    KEYWORDS_MAX_LEN = 30

    # Maximum number of keywords per post
    KEYWORDS_MAX_COUNT = 10

    # Regular expression used to split a keyword into individual keywords
    KEYWORDS_SPLIT_RE = re.compile("[\n;:().,!?/]")

    @staticmethod
    def coerce_keywords(keywords):
        """
        Either converts a list of keywords or a keywords string into a valid
        keywords string exactly as it is being stored in the database.
        """

        # Just do nothing if there are no keywords
        if keywords is None:
            return None

        # Temporarily convert the keywords into a list
        if isinstance(keywords, list):
            keywords_list = keywords
        elif isinstance(keywords, str):
            keywords_list = re.split(API.KEYWORDS_SPLIT_RE, keywords)
        else:
            raise ValidationError("%server_error_invalid_type")

        # Trim any whitespace and convert to lowercase
        keywords_list = map(lambda x: x.strip().lower(), keywords_list)

        # Remove empty keywords, convert the iterator to a list
        keywords_list = list(filter(lambda x: x, keywords_list))

        # Convert the keywords to a list and check that the total number of
        # keywords does not exceed the maximum
        if len(keywords_list) > API.KEYWORDS_MAX_COUNT:
            raise ValidationError("%server_error_too_many_keywords")

        # Remove duplicates while preserving their order
        keywords_set = set()
        i = 0
        while i < len(keywords_list):
            keyword = keywords_list[i]
            if keyword in keywords_set:
                del keywords_list[i]
            else:
                keywords_set.add(keyword)
                i += 1

        # Make sure the keywords are not longer or shorter than the minimum/
        # maximum length
        for keyword in keywords_list:
            if (len(keyword) > API.KEYWORDS_MAX_LEN) or (len(keyword) <
                                                         API.KEYWORDS_MIN_LEN):
                raise ValidationError("%server_error_invalid_keyword_len")

        # Return a string with the keywords separated by ","
        return ",".join(keywords_list)

    @staticmethod
    def coerce_post(post):
        """
        Converts a dictionary describing a post into a tivua.database.Post
        object.
        """
        # Convert the post to a Post object
        p = Post(**post)

        # There must be either an author or a cuid
        if (p.author is None) and (p.cuid is None):
            raise ValidationError("%server_error_require_author_or_cuid")
        elif p.author is None:
            p.author = p.cuid
        elif p.cuid is None:
            p.cuid = p.author

        # There must be either a ctime or a date
        if (p.ctime is None) and (p.date is None):
            raise ValueError("%server_error_equire_date_or_ctime")
        elif p.ctime is None:
            p.ctime = p.date
        elif p.date is None:
            p.date = p.ctime

        # Set mtime and muid to ctime and cuid, respectively
        if p.mtime is None:
            p.mtime = p.ctime
        if p.muid is None:
            p.muid = p.cuid

        # Coerce the keywords
        p.keywords = API.coerce_keywords(p.keywords)

        # Make sure all types are correct
        API._dataclass_check_types(p)

        return p

    @staticmethod
    def _split(s, r=","):
        return list(filter(lambda x: x, s.split(r)))

    @staticmethod
    def _post_to_dict(post):
        """
        Helper function that splits post keywords into an array before returning
        them to the callers of the post functions.
        """

        # Return nothing if the post object is empty
        if post is None:
            return None

        # Convert the post object dataclass to a dictionary
        post = asdict(post)

        # Convert the keywords to a list
        post["keywords"] = API._split(post["keywords"])

        return post

    def get_post_list(self, start, limit, filter=None):
        """
        Returns the posts in the specified range ordered by date.
        """

        # Make sure the given parameters are valid
        if not (isinstance(start, int) and isinstance(limit, int)
                and start >= 0):
            raise ValidationError()

        # Select the posts
        posts = self.db.list_posts(start, limit, False, filter)

        # Convert the posts to dictionaries
        return list(map(API._post_to_dict, posts))

    def get_post(self, pid):
        """
        Returns the post with the given PID or None if the post does not exist.
        """
        return API._post_to_dict(self.db.get_post(pid))

    def get_total_post_count(self, filter=None):
        """
        Returns the total number of posts.
        """
        return self.db.total_post_count(filter)

    def create_post(self, post):
        """
        Creates a new post.
        """

        # Coerce the post into a new Post object, make sure the pid is set to
        # "None"; otherwise the post would not get its own pid
        p = API.coerce_post(post)
        if not p.pid is None:
            raise ValidationError()

        # The revision must be set to zero
        if p.revision != 0:
            raise ValidationError()

        # Insert the post into the database
        with Transaction(self.db):
            # Create the post in the database
            p.pid = self.db.create_post(p)

            # Update the fulltext search
            self.db.update_fulltext(p.pid, p)

            # Insert keywords
            keywords = self.db.keywords
            for keyword in API._split(p.keywords):
                keywords[keyword] = p.pid

            # Convert the post back to a dictionary
            return API._post_to_dict(p)

    def update_post(self, post):
        """
        Updates an already existing post.
        """

        # Coerce the given post into a Post object, make sure the pid is set
        p = API.coerce_post(post)
        if p.pid is None:
            raise ValidationError()

        with Transaction(self.db):
            # Fetch the post that is supposed to be updated
            pid = p.pid
            old_post = self.db.get_post(pid)
            if old_post is None:
                raise NotFoundError()

            # Do nothing if there is no difference between the old and new post
            if ((old_post.author == p.author) and (old_post.date == p.date)
                    and (old_post.keywords == p.keywords)
                    and (old_post.content == p.content)):
                return API._post_to_dict(p)

            # Make sure that the revision of the given post is equal to the
            # revision of the old post; increment the revision of the post that
            # is to be stored.
            if old_post.revision != p.revision:
                raise ConflictError()
            p.revision += 1

            # Copy the original creation uid and time
            p.cuid = old_post.cuid
            p.ctime = old_post.ctime

            # Insert the old post into the history table
            self.db.create_post(old_post, history=True)

            # Remove keywords associated with the old post
            keywords = self.db.keywords
            for keyword in API._split(old_post.keywords):
                keywords[keyword] = keywords[keyword] - set((pid, ))

            # Update the post in the normal posts table
            if self.db.update_post(p) == 0:
                raise NotFoundError()

            # Update the fulltext search
            self.db.update_fulltext(pid, p)

            # Insert the new keywords
            keywords = self.db.keywords
            for keyword in API._split(p.keywords):
                keywords[keyword] = pid

            return API._post_to_dict(p)

    def delete_post(self, pid):
        # Make sure the given post id is and integer and non-negative
        if not isinstance(pid, int) or pid < 0:
            raise ValidationError()

        with Transaction(self.db):
            # Fetch the post that is supposed to be deleted
            post = self.db.get_post(pid)
            if post is None:
                raise NotFoundError()

            # Delete all keywords associated with the post
            keywords = self.db.keywords
            for keyword in API._split(post.keywords):
                keywords[keyword] = keywords[keyword] - set((pid, ))

            # Delete the post from the history, the main post table, and the
            # fulltext search index
            self.db.delete_post(pid)
            self.db.delete_post(pid, history=True)
            self.db.delete_fulltext(pid)

    ############################################################################
    # Keywords                                                                 #
    ############################################################################

    def get_keyword_list(self):
        """
        Returns an object containing the used keywords and their absolute
        counts.
        """
        return {key: count for key, count in self.db.keywords.key_counts()}

    ############################################################################
    # Users                                                                    #
    ############################################################################

    # Replacements used to construct user names; in particular, transcribe
    # German umlauts correctly
    USERNAME_REPLACEMENTS = {
        "ö": "oe",
        "ä": "ae",
        "ü": "ue",
        "ß": "ss",
        "ð": "dh",
        "þ": "th",
    }

    # Maximum length of the display_name property
    MAX_DISPLAY_NAME_LEN = 32

    @staticmethod
    def make_username(name):
        """
        Creates a username from a display name.
        """
        import unicodedata

        # Try to split the name into first and last name
        parts = API._split(name.strip().lower(), " ")
        if (len(parts) == 0):
            raise ValidationError("Name may not be empty")
        elif (len(parts) == 1):
            username = parts[0]
        else:
            username = parts[0][0] + parts[-1]

        # Apply some replacements
        for src, tar in API.USERNAME_REPLACEMENTS.items():
            username = username.replace(src, tar)

        # Convert the string to ascii
        username = unicodedata.normalize('NFKD', username)
        return str(username.encode('ascii', 'ignore'), 'ascii')[0:8]

    @staticmethod
    def coerce_user(user):
        """
        Turns a "user" dictionary into a valid tivua.database.User object.
        Throws a ValidationError exception in case the user dictionary is
        invalid.
        """

        # Try to create a User object
        u = API._dataclass_from_dict(User, user)

        # The uid must not be zero
        if u.uid == 0:
            raise ValidationError("%server_error_invalid_uid")

        # One of name and display_name is mandatory
        if (u.name is None) and (u.display_name is None):
            raise ValidationError("%server_error_no_name")
        elif u.name is None:
            u.name = API.make_username(u.display_name)

        # Strip the name and the display name
        u.name = u.name.strip().lower()
        if u.display_name:
            u.display_name = u.display_name.strip()

            # Make sure the display name is not longer than the maximum display
            # name length
            if len(u.display_name) > API.MAX_DISPLAY_NAME_LEN:
                raise ValidationError("%server_error_invalid_display_name")

        # Set the display name, if it is currently empty
        if not u.display_name:
            u.display_name = u.name

        # Capitalise the first letter of the display name
        if len(u.display_name) > 0:
            u.display_name = u.display_name[0:1].upper() + u.display_name[1:]

        # Make sure the name matches the user name regular expression
        if not API.USER_RE.match(u.name):
            raise ValidationError("%server_error_invalid_name")

        # Make sure the user role is one of the possible roles
        if not Perms.is_valid_role(u.role):
            raise ValidationError("%server_error_invalid_role")

        # Make sure all types are correct
        API._dataclass_check_types(u)

        return u

    def get_user_list(self, include_credentials=False):
        """
        Returns a list of user objects.
        """

        # Initialise the result dictionary, include a dummy "deleted" user
        res = {
            0: {
                "uid": 0,
                "name": "[deleted]",
                "display_name": "[deleted]",
            }
        }

        # Iterate over the list of users
        for user in self.db.list_users():
            user_dict = asdict(user)

            # If "include_credentials" is set to False, remove confidential
            # information. This information is only required when an
            # administrator is managing users
            if not include_credentials:
                del user_dict["role"]
                del user_dict["auth_method"]
                del user_dict["reset_password"]

            # Always remove the password hash from the user dictionary
            del user_dict["password"]

            # Store the user dictionary in the result
            res[user.uid] = user_dict
        return res

    def create_user(self, user_name, display_name="", role="inactive"):
        """
        Creates a new user with the given user name and display name.
        """

        # Create a valid user object
        user = API.coerce_user({
            "name": user_name,
            "display_name": display_name,
            "role": role
        })

        with Transaction(self.db):
            # Create a random password for the user and set it
            password = API.create_random_password()
            password_hash = self._hash_password(password)
            user.password = password_hash

            # Create the user object in the database, errors are (most likely)
            # only caused by there being a duplicate user name
            try:
                user.uid = self.db.create_user(user)
            except:
                raise ConflictError()

        # Return the newly created user object
        return password, user

    def delete_user(self, uid=None, user_name=None, force=False):
        """
        Deletes the user with the given uid or user name. Per default, does not
        delete users who already have posts; to this end, "force" has to be set
        to True. Important: this function will move all content generated by
        this user to the dummy "[deleted]" user account.

        @param uid is the numerical id of the user that should be deleted.
               Supply either uid or user_name.
        @param user_name is the name of the user that should be deleted. Supply
               either uid or user_name.
        @param force if true, force the deletion of users who contributed
               content.
        """

        with Transaction(self.db):
            # Read the user data
            user = self.db.get_user(uid=uid, user_name=user_name)
            if user is None:
                raise NotFoundError()

            # Check whether the user has any posts. If yes, either rewrite these
            # posts to the "[deleted]" user (if force=True) or do nothing and
            # abort (if force=False).
            def _rewrite(history):
                # List all the posts for the user
                filter = FilterUID(user.uid) | FilterAuthor(user.uid)
                user_posts = self.db.list_posts(history=history, filter=filter)

                # Abort if we found any posts, and "force" is not set
                if len(user_posts) > 0 and not force:
                    return False

                # Otherwise, update the post CUID or MUID to "0" and update the
                # post
                for post in user_posts:
                    if post.cuid == user.uid:
                        post.cuid = 0
                    if post.muid == user.uid:
                        post.muid = 0
                    if post.author == user.uid:
                        post.author = 0
                    self.db.update_post(post, history=history)

                return True

            # Rewrite both the current post table and the history table
            if not (_rewrite(history=False) and _rewrite(history=True)):
                return False

            # Delete all sessions for this user
            self.db.purge_sessions_for_user(user.uid)

            # Delete all settings for this user
            if user.uid in self.db.settings:
                del self.db.settings[user.uid]

            # Delete the user account itself
            self.db.delete_user(user.uid)

            # Success!
            return True

    def set_user_role(self, role, uid=None, user_name=None):
        # Make sure the role is valid
        if not Perms.is_valid_role(role):
            raise ValidationError("%server_error_invalid_role")

        with Transaction(self.db):
            # Read the user data
            user = self.db.get_user(uid=uid, user_name=user_name)
            if user is None:
                raise NotFoundError()

            # Update the role
            if role != user.role:
                # Delete any active session, if the user has fewer permissions
                perms_old = Perms.lookup_role_permissions(user.role)
                perms_new = Perms.lookup_role_permissions(role)
                if perms_old & (perms_new ^ perms_old):
                    # Note: (perms_new ^ perms_old) contains the changed
                    # permission bits, perms_old & (perms_new ^ perms_old)
                    # is not equal to zero if a bit that changed was active in
                    # perms_old.
                    self.db.purge_sessions_for_user(user.uid)

                # Write the user back with the updated role
                user.role = role
                self.db.update_user(user)

    def reset_user_password(self, uid=None, user_name=None):
        with Transaction(self.db):
            user = self.db.get_user(uid=uid, user_name=user_name)
            if user is None:
                raise NotFoundError()

            # Create a random password
            password = self.create_random_password()
            password_hash = self._hash_password(password)

            # Set the password and the reset_password flag
            user.password = password_hash
            user.reset_password = True

            # Write the user back to the database
            self.db.update_user(user)

            # Return the generated password for display
            return password

    def update_user(self, properties, uid=None, user_name=None):
        """
        Updates attributes of a user by merging the given properties into an
        existing user structure.
        """

        with Transaction(self.db):
            # Try to fetch the user, either by user name or uid
            user = self.db.get_user(uid=uid, user_name=user_name)
            if user is None:
                raise NotFoundError()

            # Make sure the settings we're trying to update actually exist, and,
            # in case they do, update the corresponding value
            for key, value in properties.items():
                # If we're updating the password to a new password and the new
                # password is actually different from the current password,
                # then reset the "reset_password" flag
                if ((key == "password")
                        and (value.lower() != user.password.lower())):
                    user.reset_password = False

                # Update all other properties
                if hasattr(user, key):
                    setattr(user, key, value)
                else:
                    raise ValidationError()

            # Coerce the updated user to make sure all new settings adhere to
            # the rules
            user_new = API.coerce_user(asdict(user))
            self.db.update_user(user_new)

            return asdict(user_new)

    ############################################################################
    # Export and import                                                        #
    ############################################################################

    def _rebuild_keywords(self):
        """
        Given the current list of posts, rebuilds the index that maps keywords
        onto a set of posts. This function is used after importing a backup.
        """
        with Transaction(self.db):
            # Delete all keywords
            self.db.keywords.clear()

            # List all posts and construct a mapping between posts and keywords
            keywords = {}
            for post in self.db.list_posts():
                for keyword in API._split(post.keywords):
                    if keyword in keywords:
                        keywords[keyword].add(post.pid)
                    else:
                        keywords[keyword] = {
                            post.pid,
                        }

            # Insert the keywords into the database; the keywords dictionary
            # is a MultiDict, i.e., it stores a set per keyword
            for keyword, pids in keywords.items():
                self.db.keywords[keyword] = pids

    def export_to_object(self, export_passwords=False):
        """
        Exports the entire database into a JSON serialisable object. Some tables
        with volatile data (such as the "cache", "challenges", and "sessions"
        tables) will not be exported.
        """
        with Transaction(self.db):
            # Export the configuration options
            config_obj = {}
            for key, value in self.db.configuration.items():
                config_obj[key] = value

            # Export the posts
            posts_arr = []
            for post in self.db.list_posts():
                posts_arr.append(asdict(post))

            # Export the post history
            posts_history_arr = []
            for post in self.db.list_posts(history=True):
                posts_history_arr.append(asdict(post))

            # Export the users
            users_arr = []
            for user in self.db.list_users():
                user_obj = asdict(user)
                if not export_passwords:
                    user_obj["reset_password"] = True
                    del user_obj["password"]
                users_arr.append(user_obj)

            # Export the user settings
            settings_obj = {}
            for key, value in self.db.settings.items():
                settings_obj[key] = value

            # Return the completely assembled object
            return {
                "configuration": config_obj,
                "posts": posts_arr,
                "posts_history": posts_history_arr,
                "users": users_arr,
                "settings": settings_obj
            }

    def import_from_object(self, obj):
        """
        Restors a database backup formerly created by the export_to_json
        function. This will delete the current content of the database.

        @param obj is a Python object that has been deserialised from JSON
        """

        # Make sure that this operation is atomic
        with Transaction(self.db):
            # Delete everything in the database
            self.db.purge()

            # Go through all restorable tables (i.e., it doesn't make much sense
            # to backup the challenges, sessions, cache, keywords tables).
            if "configuration" in obj:
                for key, value in obj["configuration"].items():
                    self.db.configuration[key] = value
            if "posts" in obj:
                for post in obj["posts"]:
                    p = API.coerce_post(post)
                    self.db.create_post(p)
                    self.db.update_fulltext(p.pid, p)
            if "posts_history" in obj:
                for post in obj["posts_history"]:
                    self.db.create_post(API.coerce_post(post), history=True)
            if "users" in obj:
                for user in obj["users"]:
                    self.db.create_user(API.coerce_user(user))
            if "settings" in obj:
                for key, value in obj["settings"].items():
                    self.db.settings[key] = value

            # Rebuild the keywords table
            self._rebuild_keywords()
