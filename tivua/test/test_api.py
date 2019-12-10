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

from tivua.api import *
from tivua.database import Database

import logging
logging.basicConfig(format='[%(levelname)s] %(message)s', level=logging.DEBUG)


def test_coerce_keywords():
    # Ignore "None"
    assert API.coerce_keywords(None) is None

    # Single keyword must be passed through correctl
    assert API.coerce_keywords("foo") == "foo"

    # Remove whitespace, convert to lower case
    assert API.coerce_keywords(" Foo, Bar ") == "foo,bar"

    # Remove empty keywords
    assert API.coerce_keywords(" Foo,,Bar ") == "foo,bar"

    # Deduplicate, but do not change order
    assert API.coerce_keywords(" Foo,,Bar,Foo ") == "foo,bar"
    assert API.coerce_keywords(" Bar,,Foo,Foo ") == "bar,foo"

    # Prevent overlong keywords
    assert (API.coerce_keywords("012345678901234567890123456789") ==
            "012345678901234567890123456789")
    with pytest.raises(ValidationError):
        API.coerce_keywords("0123456789012345678901234567891")

    # Prevent single-letter keywords
    assert API.coerce_keywords("00") == "00"
    with pytest.raises(ValidationError):
        API.coerce_keywords("a")

    # Prevent too many kexwords
    assert (API.coerce_keywords("00,01,02,03,04,05,06,07,08,09") ==
            "00,01,02,03,04,05,06,07,08,09")
    assert (API.coerce_keywords("00,01,02,,,,03,04,05,06,07,08,09") ==
            "00,01,02,03,04,05,06,07,08,09")
    with pytest.raises(ValidationError):
        API.coerce_keywords("00,01,02,03,04,05,06,07,08,09,10")


def test_make_username():
    # ASCII only usernames
    assert API.make_username("John Doe") == "jdoe"
    assert API.make_username("Doe") == "doe"

    # Remove accents
    assert API.make_username("Éomer Son of Théodwyn") == "etheodwy"

    # German umlauts
    assert API.make_username("Bleda Blödelin") == "bbloedel"

    # Nordic characters
    assert API.make_username("Aðalfríður Aðalráðsdóttir") == "aadhalra"


def test_coerce_user():
    # Make sure all properties are properly passed through
    user_1 = {
        "uid": 2,
        "name": "jdoe",
        "display_name": "Joane Doe",
        "role": "admin",
        "auth_method": "password",
        "password": "S3kr3t",
        "reset_password": True,
    }
    assert API.coerce_user(user_1) == User(**user_1)

    # Make sure there is an exception if the user and display name are empty
    with pytest.raises(ValidationError):
        API.coerce_user({})

    # There shouldn't be an error if only the display name or the user name
    # are set
    API.coerce_user({"name": "ASTOECKE"}).name == "astoecke"
    API.coerce_user({"name": "    ASTOECKE   "}).name == "astoecke"
    API.coerce_user({"display_name": " Andreas Stöckel"}).name == "astoecke"
    API.coerce_user({
        "display_name": "andreas stöckel "
    }).display_name == "Andreas stöckel"

    # There should be an exception when choosing an invalid user name
    with pytest.raises(ValidationError):
        API.coerce_user({"name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
    with pytest.raises(ValidationError):
        API.coerce_user({"name": "####+?!!!"})
    with pytest.raises(ValidationError):
        API.coerce_user({"name": "foo bar"})


def test_delete_user():
    # Create an API instance
    with API(Database()) as api:
        # Create a user
        _, user = api.create_user("astoecke")
        assert user.uid == 2 # First user created after the "admin" user

        # List all users
        users = api.get_user_list()
        assert(len(users) == 3)

        # Create a few new posts for the user
        post = api.create_post({
            "cuid": user.uid,
            "content": "Foo",
            "date": 12354678,
        })
        assert post["pid"] == 1
        assert post["cuid"] == 2
        assert post["muid"] == 2
        assert post["author"] == 2

        post = api.create_post({
            "cuid": user.uid,
            "muid": 1,
            "author": 1,
            "content": "Foo",
            "date": 12354678,
        })
        assert post["pid"] == 2
        assert post["cuid"] == 2
        assert post["muid"] == 1
        assert post["author"] == 1

        post = api.create_post({
            "cuid": 1,
            "muid": 1,
            "author": user.uid,
            "content": "Foo",
            "date": 12354678,
        })
        assert post["pid"] == 3
        assert post["cuid"] == 1
        assert post["muid"] == 1
        assert post["author"] == 2

        posts = api.get_post_list(start=0, limit=-1)
        assert(len(posts) == 3)

        # Delete the user
        api.delete_user(user.uid, force=True)
        users = api.get_user_list()
        print(users)
        assert(len(users) == 2)

        # After deleting the user, all references to the user should no longer
        # exist
        posts = api.get_post_list(start=0, limit=-1)
        assert(len(posts) == 3)
        assert posts[0]["pid"] == 1
        assert posts[0]["cuid"] == 0
        assert posts[0]["muid"] == 0
        assert posts[0]["author"] == 0
        assert posts[1]["pid"] == 2
        assert posts[1]["cuid"] == 0
        assert posts[1]["muid"] == 1
        assert posts[1]["author"] == 1
        assert posts[2]["pid"] == 3
        assert posts[2]["cuid"] == 1
        assert posts[2]["muid"] == 1
        assert posts[2]["author"] == 0
