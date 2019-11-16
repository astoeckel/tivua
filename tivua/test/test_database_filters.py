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
from tivua.database_filters import *

def compile_filter(flt):
    sql, params, _ = flt.simplify().compile("posts").emit(["pid"])
    return sql, params

def test_simple_author_filter():
    sql, params = compile_filter(FilterAuthor(4))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.author = ?)"
    assert params == (4,)

def test_simple_uid_filter():
    sql, params = compile_filter(FilterUID(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE ((p.cuid = ?) OR (p.muid = ?))"
    assert params == (5, 5,)

def test_simple_filter_date_interval():
    sql, params = compile_filter(FilterDateInterval(1, 2))
    assert sql == "SELECT p.pid FROM posts AS p WHERE ((p.date >= ?) AND (p.date <= ?))"
    assert params == (1, 2)

    sql, params = compile_filter(FilterDateInterval(min_=2))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.date >= ?)"
    assert params == (2,)

    sql, params = compile_filter(FilterDateInterval(max_=3))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.date <= ?)"
    assert params == (3,)

    sql, params = compile_filter(FilterDateInterval())
    assert sql == "SELECT p.pid FROM posts AS p"
    assert params == tuple()

def test_logical_or_filter():
    sql, params = compile_filter(FilterAuthor(4) | FilterUID(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE ((p.author = ?) OR ((p.cuid = ?) OR (p.muid = ?)))"
    assert params == (4, 5, 5)

    # Simplification or OR + TRUE/OR + FALSE
    sql, params = compile_filter(FilterAuthor(4) | FilterTrue())
    assert sql == "SELECT p.pid FROM posts AS p"
    assert params == tuple()
    sql, params = compile_filter(FilterAuthor(4) | FilterFalse())
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.author = ?)"
    assert params == (4,)

def test_logical_and_filter():
    sql, params = compile_filter(FilterAuthor(4) & FilterUID(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE ((p.author = ?) AND ((p.cuid = ?) OR (p.muid = ?)))"
    assert params == (4, 5, 5)

    # Combination with a no-op filter
    sql, params = compile_filter(FilterDateInterval() & FilterAuthor(4))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.author = ?)"
    assert params == (4,)

    sql, params = compile_filter(FilterAuthor(4) & FilterDateInterval())
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.author = ?)"
    assert params == (4,)

    # Selection of two different authors with "AND"
    sql, params = compile_filter(FilterAuthor(4) & FilterAuthor(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE FALSE"
    assert params == tuple()

    # Selection of the same author with "AND"
    sql, params = compile_filter(FilterAuthor(5) & FilterAuthor(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.author = ?)"
    assert params == (5,)

    # Complex combinations with a no-op filter
    sql, params = compile_filter(FilterDateInterval() & FilterUID(4) & FilterAuthor(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (((p.cuid = ?) OR (p.muid = ?)) AND (p.author = ?))"
    assert params == (4, 4, 5)
    sql, params = compile_filter(FilterUID(4) & FilterDateInterval() & FilterAuthor(5))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (((p.cuid = ?) OR (p.muid = ?)) AND (p.author = ?))"
    assert params == (4, 4, 5)
    sql, params = compile_filter(FilterUID(4) & FilterAuthor(5) & FilterDateInterval())
    assert sql == "SELECT p.pid FROM posts AS p WHERE (((p.cuid = ?) OR (p.muid = ?)) AND (p.author = ?))"
    assert params == (4, 4, 5)

    # Simplification or AND + TRUE/AND + FALSE
    sql, params = compile_filter(FilterAuthor(4) & FilterTrue())
    assert sql == "SELECT p.pid FROM posts AS p WHERE (p.author = ?)"
    assert params == (4,)
    sql, params = compile_filter(FilterAuthor(4) & FilterFalse())
    assert sql == "SELECT p.pid FROM posts AS p WHERE FALSE"
    assert params == tuple()

def test_logical_not_filter():
    sql, params = compile_filter(~FilterAuthor(4))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (NOT (p.author = ?))"
    assert params == (4,)

    # Negation of true
    sql, params = compile_filter(~FilterTrue())
    assert sql == "SELECT p.pid FROM posts AS p WHERE FALSE"
    assert params == tuple()

    # Negation of false
    sql, params = compile_filter(~FilterFalse())
    assert sql == "SELECT p.pid FROM posts AS p"
    assert params == tuple()

    sql, params = compile_filter(~(FilterAuthor(4) & FilterUID(5)))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (NOT ((p.author = ?) AND ((p.cuid = ?) OR (p.muid = ?))))"
    assert params == (4, 5, 5)

    # Double negation
    sql, params = compile_filter(~~(FilterAuthor(4) & FilterUID(5)))
    assert sql == "SELECT p.pid FROM posts AS p WHERE ((p.author = ?) AND ((p.cuid = ?) OR (p.muid = ?)))"
    assert params == (4, 5, 5)

    # Negation of keyword selection
    sql, params = compile_filter(~FilterKeyword("nengo"))
    assert sql == "SELECT p.pid FROM posts AS p WHERE (NOT (p.pid IN (SELECT p.pid FROM posts AS p JOIN keywords AS k ON (k.pid = p.pid) WHERE (k.keyword = ?) GROUP BY p.pid)))"
    assert params == ("nengo",)


def test_filter_keywords():
    sql, params = compile_filter(FilterKeyword("nengo"))
    assert sql == "SELECT p.pid FROM posts AS p JOIN keywords AS k ON (k.pid = p.pid) WHERE (k.keyword = ?) GROUP BY p.pid"
    assert params == ("nengo",)

    sql, params = compile_filter(FilterKeyword("nengo") & FilterKeyword("nengo-gui"))
    assert sql == "SELECT p.pid FROM posts AS p JOIN keywords AS k1 ON (k1.pid = p.pid) JOIN keywords AS k2 ON (k2.pid = p.pid) WHERE ((k1.keyword = ?) AND (k2.keyword = ?)) GROUP BY p.pid"
    assert params == ("nengo", "nengo-gui")


def test_filter_fulltext():
    sql, params = compile_filter(FilterFullText("riser\"'") | FilterFullText("blarg"))
    assert sql == "SELECT p.pid FROM posts AS p JOIN fulltext AS f ON (f.rowid = p.pid) WHERE (f.content MATCH ?) GROUP BY p.pid"
    assert params == ("(\"riser\" OR \"blarg\")",)

    sql, params = compile_filter(FilterFullText("riser\"'") | FilterKeyword("nengo"))
    assert sql == "SELECT p.pid FROM posts AS p WHERE ((p.pid IN (SELECT p.pid FROM posts AS p JOIN fulltext AS f ON (f.rowid = p.pid) WHERE (f.content MATCH ?) GROUP BY p.pid)) OR (p.pid IN (SELECT p.pid FROM posts AS p JOIN keywords AS k ON (k.pid = p.pid) WHERE (k.keyword = ?) GROUP BY p.pid)))"
    assert params == ("\"riser\"", "nengo")
    print(sql, params)
