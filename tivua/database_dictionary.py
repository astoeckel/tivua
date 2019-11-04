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
@file database_dictionary.py

Defines the make_database_dict_class that is used by tivua.database.Database
to provide key-value stores with a dict-like interface.

@author Andreas Stöckel
"""

################################################################################
# PUBLIC INTERFACE                                                             #
################################################################################

from tivua.database_transaction import Transaction


def make_database_dict_class(table, key="key", value="value", multidict=False):
    """
    Creates a class that modifies a key-value store insides a SQLite database
    and that can be used like a normal Python dictionary. This function is
    mainly used internally by the Database class.
    """

    # Prepare the SQL statements, so we don't have to construct these strings
    # over and over again
    t, k, v = table, key, value

    # Query for looking up a single element
    if multidict:
        _sql_lookup = "SELECT {} FROM {} WHERE {} = ?".format(v, t, k)
    else:
        _sql_lookup = "SELECT {} FROM {} WHERE {} = ? LIMIT 1".format(v, t, k)

    # Query for listing all key, value pairs
    _sql_list_items = "SELECT {}, {} FROM {} ORDER BY {} ASC".format(k, v, t, k)
    if multidict:
        _sql_list_keys, _sql_list_values = _sql_list_items, _sql_list_items
    else:
        _sql_list_keys = "SELECT {} FROM {} ORDER BY {} ASC".format(k, t, k)
        _sql_list_values = "SELECT {} FROM {} ORDER BY {} ASC".format(v, t, k)

    # Query for checking whether a key is in the dictionary
    _sql_contains = "SELECT TRUE FROM {} WHERE {} = ?".format(t, k)

    # Query for deleting a specific key
    _sql_delete = "DELETE FROM {} WHERE {} = ?".format(t, k)

    # Queries for inserting a new key, value pair into the database, or updating
    # an existing value
    if multidict:
        _sql_upsert = "INSERT INTO {}({}, {}) VALUES (?, ?) ON CONFLICT({}, {}) DO UPDATE SET {}= ?".format(
            t, k, v, k, v, v)
    else:
        _sql_upsert = "INSERT INTO {}({}, {}) VALUES (?, ?) ON CONFLICT({}) DO UPDATE SET {}= ?".format(
            t, k, v, k, v)

    # Query for clearing the entire dictionary
    _sql_clear = "DELETE FROM {}".format(t)

    # Query for obtaining the number of keys in the dictionary
    if multidict:
        _sql_len = "SELECT COUNT(DISTINCT {}) FROM {}".format(k, t)
    else:
        _sql_len = "SELECT COUNT() FROM {}".format(t)

    # Query for obtaining the number of values associated with each key
    # (this is mainly relevant for multidicts, but the same query works with
    # regular dictionaries as well)
    _sql_list_key_counts = "SELECT {}, COUNT() FROM {} GROUP BY {} ORDER BY {} ASC".format(k, t, k, k);

    def make_iterator(sql, return_key=True, return_value=True, return_count=False):
        """
        Used to instantiate the individual iterator types for the items(),
        keys() and values() functions.
        """

        # Some shorthands
        rk, rv = return_key, return_value

        class MultiDictIterator:
            """
            Multi-dictionary iterator that willbe returned when iterating
            over the objects returned by the DatabaseDict items(), keys()
            and values() funciton.
            """

            def __init__(self, c):
                self.c = c
                self.cache = None

            def __next__(self):
                R = [None, set()]
                while True:
                    # If we don't have a value cached from the last call to
                    # __next__, fetch the next entry
                    if self.cache is None:
                        self.cache = self.c.fetchone()

                    # If there is no next element, either return the current
                    # result object or stop the iteration
                    if self.cache is None:
                        if R[0] is None:
                            raise StopIteration
                        else:
                            break

                    # If we don't have a result object, initialise it
                    if R[0] is None:
                        R[0] = self.cache[0]

                    # If the current (key, value) pair has the same key as the
                    # current result object, just add the value to the result.
                    # This relies on the items being sorted by key.
                    if R[0] == self.cache[0]:
                        R[1].add(self.cache[1])
                        self.cache = None
                    else:
                        # Otherwise, if the keys do not match, return the
                        # current result object
                        break

                # Either return a (key, value) pair or only the key and value
                return (tuple(R) if rk and rv else (R[0] if rk else R[1]))

        class DictIterator:
            """
            Iterator that will be returned when iterating over the objects
            returned by the DatabaseDict items(), keys() and values()
            function.
            """

            def __init__(self, c):
                self.c = c

            def __next__(self):
                R = self.c.fetchone()
                if R is None:
                    raise StopIteration
                return R if rk and rv else R[0]

        class DictIteratorWrapper:
            """
            Iterable object that will be returned by the DatabaseDict items(),
            keys() and values() function. This class must be used inside a
            Transaction on the active DB.
            """

            def __init__(self, db):
                self.db = db

            def __iter__(self):
                c = self.db.conn.cursor()
                c.execute(sql)
                if multidict and not return_count:
                    return MultiDictIterator(c)
                else:
                    return DictIterator(c)

        return DictIteratorWrapper

    # Create the individual iterator types
    ItemsIterator = make_iterator(_sql_list_items, True, True)
    KeysIterator = make_iterator(_sql_list_keys, True, False)
    ValuesIterator = make_iterator(_sql_list_values, False, True)
    KeyCountsIterator = make_iterator(_sql_list_key_counts, True, True, True)

    class DatabaseDict:
        """
        The DatabaseDict class provides a key value store on top of a
        SQLite table containing the columns "key" and "value", where "key" is a
        primary key. It implements a persistent dictionary.
        """

        def __init__(self, db):
            """
            Constructor of the DatabaseKeyValueStore class. Copies the given
            parameters.

            @param db is the database instance
            """
            self.db = db

        def lookup(self, key):
            """
            Looks up the given key. Returns the associated value or None if the
            key-value pair does not exist.

            @param key is the key that should be looked up.
            """
            with Transaction(self.db) as t:
                t.execute(_sql_lookup, (key, ))
                if multidict:
                    x = t.fetchall()
                    return None if len(x) == 0 else set(map(lambda x: x[0], x))
                else:
                    return t.fetchone()[0]

        def __contains__(self, key):
            with Transaction(self.db) as t:
                t.execute(_sql_contains, (key, ))
                return bool(t.fetchone())

        def __delitem__(self, key):
            with Transaction(self.db) as t:
                t.execute(_sql_delete, (key, ))
                if t.rowcount == 0:
                    raise KeyError(key)

        def __getitem__(self, key):
            res = self.lookup(key)
            if res is None:
                raise KeyError(key)
            return res

        def __setitem__(self, key, value):
            with Transaction(self.db) as t:
                if multidict and (isinstance(value, list) or isinstance(
                        value, set) or isinstance(value, tuple)):
                    t.execute(_sql_delete, (key,))
                    for v in value:
                        t.execute(_sql_upsert, (key, v, v))
                else:
                    t.execute(_sql_upsert, (key, value, value))
                return value

        def __len__(self):
            with Transaction(self.db) as t:
                t.execute(_sql_len)
                return t.fetchone()[0]

        def items(self):
            return ItemsIterator(self.db)

        def keys(self):
            return KeysIterator(self.db)

        def key_counts(self):
            return KeyCountsIterator(self.db)

        def values(self):
            return ValuesIterator(self.db)

        def clear(self):
            with Transaction(self.db) as t:
                t.execute(_sql_clear)

    return DatabaseDict

