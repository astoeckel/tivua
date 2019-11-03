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

Contains the bussiness logic of Tivua -- receives raw, unvalidated calls from
the HTTP server or the CLI applications and translates them into corresponding
database calls.

@author Andreas Stöckel
"""

import re, os, json
from dataclasses import astuple, asdict
from tivua.database import Transaction

################################################################################
# LOGGER                                                                       #
################################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# PUBLIC INTERFACE                                                             #
################################################################################


class ValidationError(ValueError):
    pass


class AuthentificationError(RuntimeError):
    pass


class NotFoundError(RuntimeError):
    pass


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
        if perform_initialisation:
            with Transaction(self.db):
                self._init_configuration()
                self._init_users()

    def _init_configuration(self):
        """
        Initialises non-existent configuration keys to default values.
        """
        # Fetch the config dict
        config = self.db.config

        # Generate the cryptographic salt used to hash passwords
        if not ("salt" in config):
            salt = os.urandom(32).hex()
            config["salt"] = salt
            logger.warning("Initialized password salt to \"{}\"".format(salt))

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
        for user in self.db.list_users():
            if user.name == "admin" or user.role == "admin":
                return

        # Create a random password and print it to the log
        password = self.create_random_password()
        logger.warning(
            "No admin user found; created new user \"admin\" with password \"{}\""
            .format(password))

        # Actually create the user
        self.db.create_user(
            name='admin',
            display_name='Admin',
            role='admin',
            auth_method='password',
            password=self._hash_password(password),
            reset_password=True)

    ############################################################################
    # Configuration                                                            #
    ############################################################################

    def get_configuration_object(self):
        """
        Returns a JSON serialisable object containing the global configuration
        options.
        """
        with Transaction(self.db):
            c = self.db.config
            return {
                "login_methods": {
                    "username_password":
                    c["login_method_username_password"] == "1",
                    "cas":
                    c["login_method_cas"] == "1",
                }
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
            salt = self.db.config["salt"]
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
    USER_RE = re.compile("^[a-z0-9._-]{3,16}$")

    # Possible user permissions
    PERM_CAN_READ = 1
    PERM_CAN_WRITE = 2
    PERM_CAN_ADMIN = 4

    # List of user roles
    USER_ROLES = {
        # Inactive users cannot login. Users should be marked as "inactive"
        # instead of deleting them to preserve their posts.
        "inactive": 0,

        # A "reader" is not able to create or edit any posts, but may still
        # read them.
        "reader": PERM_CAN_READ,

        # A author user can both read and write posts.
        "author": PERM_CAN_READ | PERM_CAN_WRITE,

        # A admin user can read, write and administrate a Tivua instance.
        "admin": PERM_CAN_READ | PERM_CAN_WRITE | PERM_CAN_ADMIN,
    }

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
            return {"salt": self.db.config["salt"], "challenge": challenge}

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

    @staticmethod
    def lookup_role_permissions(role):
        """
        Converts a "role" string into a set of permissions.
        """
        if not role in API.USER_ROLES:
            return 0
        return API.USER_ROLES[role]

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
            if self.lookup_role_permissions(user.role) <= 0:
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
                "user_name": <the canonical user name>,
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
                "user_name": user.name,
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

        TODO: Provide method to not update the settings, as currently an
        ill-behaving client has no chance to remove setting keys.
        """

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
            settings_str = json.dumps(settings)
            if len(settings_str) > API.MAX_SETTINGS_LEN:
                raise ValidationError()

            # Store the old values in the database
            self.db.settings[uid] = settings_str
            return settings

    ############################################################################
    # Posts                                                                    #
    ############################################################################

    @staticmethod
    def _post_split_keywords(post):
        """
        Helper function that splits post keywords into an array before returning
        them the callers of the post functions.
        """
        post["keywords"] = post["keywords"].split(",")
        return post

    def get_post_list(self, start, limit):
        """
        Returns the posts in the specified range ordered by date.
        """

        # Make sure the given parameters are valid
        if not (isinstance(start, int) and isinstance(limit, int) and start >= 0):
            raise ValidationError()

        # Select the posts
        posts = self.db.list_posts(start, limit)

        # Convert the posts to dictionaries
        return list(map(API._post_split_keywords, map(asdict, posts)))

    def get_post(self, pid):
        """
        Returns the post with the given PID or None if the post does not exist.
        """
        post = self.db.get_post(pid)
        return None if post is None else API._post_split_keywords(asdict(post))

    def get_total_post_count(self):
        return self.db.total_post_count()

    ############################################################################
    # Keywords                                                                 #
    ############################################################################

    def get_keyword_list(self):
        """
        Returns a list of used keywords.
        """
        return self.db.get_keyword_list()

    ############################################################################
    # Users                                                                    #
    ############################################################################

    def get_user_list(self, include_credentials=False):
        """
        Returns a list of user objects.
        """
        res = {}
        for user in self.db.list_users():
            user_dict = asdict(user)

            # If "include_credentials" is set to False, remove confidential
            # information. This information is only required when an
            # administrator is managing users
            if not include_credentials:
                del user_dict["role"]
                del user_dict["auth_method"]
                del user_dict["reset_password"]

            # Always remove the password hash from the user dictionary.
            del user_dict["password"]

            res[user.uid] = user_dict
        return res
