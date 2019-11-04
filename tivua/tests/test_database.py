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


def test_keywords_dict():
    with Database(':memory:') as db:
        keywords = db.keywords

        # Empty dictionary
        assert len(keywords) == 0

        # Add a single keyword
        keywords["foo"] = 184
        assert len(keywords) == 1
        assert keywords["foo"] == {184,}
        assert "foo" in keywords
        assert list(keywords.items()) == [("foo", {184,})]
        assert list(keywords.keys()) == ["foo"]
        assert list(keywords.values()) == [{184,}]
        assert list(keywords.key_counts()) == [("foo", 1)]

        # Add another keyword
        keywords["bar"] = 897
        assert len(keywords) == 2
        assert "bar" in keywords
        assert keywords["bar"] == {897}
        assert list(keywords.items()) == [("bar", {897,}), ("foo", {184,}),]
        assert list(keywords.keys()) == ["bar", "foo"]
        assert list(keywords.values()) == [{897,}, {184,},]
        assert list(keywords.key_counts()) == [("bar", 1), ("foo", 1)]

        # Add another post to the keyword
        keywords["foo"] = 583
        assert len(keywords) == 2
        assert "foo" in keywords
        assert keywords["foo"] == {184, 583}
        assert list(keywords.items()) == [("bar", {897,}), ("foo", {184, 583}),]
        assert list(keywords.keys()) == ["bar", "foo"]
        assert list(keywords.values()) == [{897,}, {184, 583},]
        assert list(keywords.key_counts()) == [("bar", 1), ("foo", 2)]

        # Try to add the same pair again -- nothing should change
        keywords["foo"] = 583
        assert len(keywords) == 2
        assert "foo" in keywords
        assert keywords["foo"] == {184, 583}
        assert list(keywords.items()) == [("bar", {897,}), ("foo", {184, 583}),]
        assert list(keywords.keys()) == ["bar", "foo"]
        assert list(keywords.values()) == [{897,}, {184, 583},]
        assert list(keywords.key_counts()) == [("bar", 1), ("foo", 2)]

        # Explicitly assign a set to the multi dict
        keywords["foo"] = {1,2,3}
        assert len(keywords) == 2
        assert "foo" in keywords
        assert keywords["foo"] == {1, 2, 3}
        assert list(keywords.items()) == [("bar", {897,}), ("foo", {1, 2, 3}),]
        assert list(keywords.keys()) == ["bar", "foo"]
        assert list(keywords.values()) == [{897,}, {1, 2, 3},]
        assert list(keywords.key_counts()) == [("bar", 1), ("foo", 3)]

        # Delete an entry from the dictionary
        del keywords["bar"]
        assert len(keywords) == 1
        assert not "bar" in keywords
        assert list(keywords.items()) == [("foo", {1, 2, 3}),]
        assert list(keywords.keys()) == ["foo"]
        assert list(keywords.values()) == [{1, 2, 3},]
        assert list(keywords.key_counts()) == [("foo", 3)]

        # Delete the last
        del keywords["foo"]
        assert len(keywords) == 0
        assert not "foo" in keywords
        assert list(keywords.items()) == []
        assert list(keywords.keys()) == []
        assert list(keywords.values()) == []
        assert list(keywords.key_counts()) == []

        # Deleting a non-existing entry should raise an exception
        with pytest.raises(KeyError):
            del keywords["foo"]

        # Accessing a non-existing entry should raise an exception
        with pytest.raises(KeyError):
            keywords["foo"]


def test_cache_dict():
    with Database(':memory:') as db:
        cache = db.cache

        # Empty dictionary
        assert len(cache) == 0

        # Add a single keyword
        cache["foo"] = b"bar"
        assert len(cache) == 1
        assert cache["foo"] == b"bar"
        assert "foo" in cache
        assert list(cache.items()) == [("foo", b"bar")]
        assert list(cache.keys()) == ["foo"]
        assert list(cache.values()) == [b"bar"]
        assert list(cache.key_counts()) == [("foo", 1)]

        # Add another keyword
        cache["bar"] = b"test"
        assert len(cache) == 2
        assert "bar" in cache
        assert cache["bar"] == b"test"
        assert list(cache.items()) == [("bar", b"test"), ("foo", b"bar")]
        assert list(cache.keys()) == ["bar", "foo"]
        assert list(cache.values()) == [b"test", b"bar"]
        assert list(cache.key_counts()) == [("bar", 1), ("foo", 1)]

        # Override the first keyword
        cache["foo"] = b"test2"
        assert len(cache) == 2
        assert "bar" in cache
        assert cache["bar"] == b"test"
        assert list(cache.items()) == [("bar", b"test"), ("foo", b"test2")]
        assert list(cache.keys()) == ["bar", "foo"]
        assert list(cache.values()) == [b"test", b"test2"]
        assert list(cache.key_counts()) == [("bar", 1), ("foo", 1)]

        # Delete an entry from the dictionary
        del cache["bar"]

        # Delete the last key
        del cache["foo"]

        # Deleting a non-existing entry should raise an exception
        with pytest.raises(KeyError):
            del cache["foo"]

        # Accessing a non-existing entry should raise an exception
        with pytest.raises(KeyError):
            cache["foo"]


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
            "uid": 2,
            "name": "jdoe",
            "display_name": "Joane Doe",
            "role": "admin",
            "auth_method": "password",
            "password": "S3kr3t",
            "reset_password": True,
        })
        user_2 = User(**{
            "uid": None, # This will automatically generate a uid
            "name": "jdoe2",
            "display_name": "Jo Doe",
            "role": "inactive",
            "auth_method": "cas",
            "password": "Pa55wort",
            "reset_password": False,
        })

        # Create two users
        assert len(db.list_users()) == 0
        assert db.create_user(user_1) == 2
        assert db.create_user(user_2) == 3

        # Update the uid
        user_2.uid = 3

        assert db.list_users() == [user_1, user_2]

        assert db.get_user_by_name("jdoe") == user_1
        assert db.get_user_by_id(user_1.uid) == user_1
        assert db.get_user_by_name("jdoe2") == user_2
        assert db.get_user_by_id(user_2.uid) == user_2
        assert db.get_user_by_name("jdoe3") is None
        assert db.get_user_by_id(100) is None

        assert db.delete_user(100) == False
        assert db.delete_user(user_2.uid) == True
        assert db.get_user_by_id(user_2.uid) is None
        assert db.list_users() == [user_1,]

