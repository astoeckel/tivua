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

import pytest

from tivua.database import *

import time

import logging
logging.basicConfig(format='[%(levelname)s] %(message)s', level=logging.DEBUG)


def test_transactions():
    with Database(':memory:') as db:
        # Store something in the user settings dictionary
        db.settings[4] = "foo"
        assert db.settings[4] == "foo"

        # Run an inner update that must be rolled back because of an exception
        try:
            with Transaction(db) as t:
                db.settings[4] = "foo2"
                assert db.settings[4] == "foo2"
                raise Exception("Test")
        except:
            pass

        # We should be back to the original state
        assert db.settings[4] == "foo"


def test_session_management():
    with Database(':memory:') as db:
        # Create and delete sessions
        assert db.get_session_uid("foo") is None
        db.create_session("foo", 42)
        assert db.get_session_uid("foo") == 42
        assert db.delete_session("foo") == True
        assert db.get_session_uid("foo") is None
        assert db.delete_session("foo") == False


@pytest.mark.skip(reason="Slow test")
def test_session_management_timeouts():
    with Database(':memory:') as db:
        # Test session timeouts
        db.create_session("bar", 43)
        assert db.get_session_uid("bar") == 43
        assert db.purge_stale_sessions(1) == False
        assert db.get_session_uid("bar") == 43
        time.sleep(2)
        assert db.purge_stale_sessions(1) == True
        assert db.get_session_uid("bar") is None

        # Test session renewal
        db.create_session("bar", 43)
        assert db.get_session_uid("bar") == 43
        time.sleep(2)
        assert db.update_session_mtime("bar") == True
        assert db.update_session_mtime("bar2") == False
        assert db.purge_stale_sessions(1) == False
        assert db.get_session_uid("bar") == 43

        # Test challenge removal
        db.challenges["test"] = db.now()
        assert "test" in db.challenges
        assert db.purge_stale_challenges(1) == False
        assert "test" in db.challenges
        time.sleep(2)
        assert db.purge_stale_challenges(1) == True
        assert not "test" in db.challenges


def test_user_management():
    from dataclasses import asdict

    with Database(":memory:") as db:
        # Some user data
        user_1 = User(**{
            "uid": 1,
            "name": "jdoe",
            "display_name": "Joane Doe",
            "role": "admin",
            "auth_method": "password",
            "password": "S3kr3t",
            "reset_password": True,
        })
        user_2 = User(**{
            "uid": 2,
            "name": "jdoe2",
            "display_name": "Jo Doe",
            "role": "inactive",
            "auth_method": "cas",
            "password": "Pa55wort",
            "reset_password": False,
        })

        # Create two users
        assert len(db.list_users()) == 0
        assert db.create_user(
            **{x: y
               for x, y in asdict(user_1).items() if x != "uid"}) == 1
        assert db.create_user(
            **{x: y
               for x, y in asdict(user_2).items() if x != "uid"}) == 2

        assert db.list_users() == [user_1, user_2]

        assert db.get_user_by_name("jdoe") == user_1
        assert db.get_user_by_id(1) == user_1
        assert db.get_user_by_name("jdoe2") == user_2
        assert db.get_user_by_id(2) == user_2
        assert db.get_user_by_name("jdoe3") is None
        assert db.get_user_by_id(3) is None

        assert db.delete_user(3) == False
        assert db.delete_user(2) == True
        assert db.get_user_by_id(2) is None
        assert db.list_users() == [user_1,]

