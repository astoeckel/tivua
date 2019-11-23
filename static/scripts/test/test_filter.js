// jshint node: true
// jshint mocha: true

/*
 *  TIVUA -- Shared research blog
 *  Copyright (C) 2019  Andreas Stöckel
 *
 *  https://github.com/astoeckel/tivua
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file test_filter.js
 *
 * Unit tests for the "filter.js" module. Run via "npm test".
 *
 * @author Andreas Stöckel
 */

"use strict";

const assert = require("assert");
const filter = require("../filter.js").tivua.filter;

/*
 * Internal constants copied from the internals of the filter module.
 */

const TOKEN_STRING = 1;
const TOKEN_LITERAL = 2;
const TOKEN_PAREN_OPEN = 3;
const TOKEN_PAREN_CLOSE = 4;
const TOKEN_COLON = 5;
const TOKEN_HASH = 6;
const TOKEN_AND = 7;
const TOKEN_OR = 8;
const TOKEN_NOT = 9;

const NODE_WORD = 1;
const NODE_FILTER = 2;
const NODE_AND = 3;
const NODE_OR = 4;
const NODE_NOT = 5;
const NODE_NOP = 6;
const NODE_ERR = 7;

const LITERAL_REQUIRED_RE = /(["']|^[#!]|\s)/;

/**
 * Internally used helper function to convert an ASTNode to a string. This
 * function is similar to canonicalize(), but does not try to be smart in any
 * way.
 */
function ast_to_string(node) {
	function escape(t) {
		const s = (typeof t == "string") ? t : t.text;
		if (s.match(LITERAL_REQUIRED_RE)) {
			return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
		}
		return s;
	}
	if (node.type == NODE_AND) {
		return "(" + node.children.map(x => ast_to_string(x)).join(" AND ") + ")";
	} else if (node.type == NODE_OR) {
		return "(" + node.children.map(x => ast_to_string(x)).join(" OR ") + ")";
	} else if (node.type == NODE_NOT) {
		return "(NOT " + ast_to_string(node.children[0]) + ")";
	} else if (node.type == NODE_WORD) {
		return escape(node.value);
	} else if (node.type == NODE_FILTER) {
		if (node.key.type == TOKEN_HASH) {
			return "tag:" + escape(node.value);
		}
		return escape(node.key) + ":" + escape(node.value);
	} else if (node.type == NODE_NOP) {
		return "NOP";
	} else if (node.type == NODE_ERR) {
		return "ERROR(" + escape(node.msg) + ")";
	}
	return "";
}

const user_list = {
	1: {
		"name": "jdoe",
		"display_name": "Joane Doe",
	}
};

describe('Filter', () => {
	describe('#tokenize()', () => {
		function mk_token(type, text, start, end) {
			return {
				"type": type,
				"text": text,
				"start": start,
				"end": end,
			};
		}

		it("simple token string", () => {
			assert.deepEqual(filter.tokenize("test"),
				[mk_token(TOKEN_STRING, "test", 0, 4)]);
		});

		it("literal starting with \"", () => {
			assert.deepEqual(filter.tokenize("\"test \\\" AND NOT # !\""),
				[mk_token(TOKEN_LITERAL, "test \" AND NOT # !", 0, 21)]);
		});

		it("literal starting with \'", () => {
			assert.deepEqual(filter.tokenize("'test \\\\\\\' AND NOT # !'"),
				[mk_token(TOKEN_LITERAL, "test \\\' AND NOT # !", 0, 23)]);
		});

		it("C-style operators", () => {
			assert.deepEqual(filter.tokenize("&& ||"),
			[
				mk_token(TOKEN_AND, "&&", 0, 2),
				mk_token(TOKEN_OR, "||", 3, 5),
			]);
		});

		it("long test string", () => {
			assert.deepEqual(filter.tokenize("te#st te!st te:st NOT \"NOT\" (foo OR bar AND) #test !foo fo(b)ar"),
			[
				mk_token(TOKEN_STRING, "te#st", 0, 5),
				mk_token(TOKEN_STRING, "te!st", 6, 11),
				mk_token(TOKEN_STRING, "te", 12, 14),
				mk_token(TOKEN_COLON, ":", 14, 15),
				mk_token(TOKEN_STRING, "st", 15, 17),
				mk_token(TOKEN_NOT, "NOT", 18, 21),
				mk_token(TOKEN_LITERAL, "NOT", 22, 27),
				mk_token(TOKEN_PAREN_OPEN, "(", 28, 29),
				mk_token(TOKEN_STRING, "foo", 29, 32),
				mk_token(TOKEN_OR, "OR", 33, 35),
				mk_token(TOKEN_STRING, "bar", 36, 39),
				mk_token(TOKEN_AND, "AND", 40, 43),
				mk_token(TOKEN_PAREN_CLOSE, ")", 43, 44),
				mk_token(TOKEN_HASH, "#", 45, 46),
				mk_token(TOKEN_STRING, "test", 46, 50),
				mk_token(TOKEN_NOT, "!", 51, 52),
				mk_token(TOKEN_STRING, "foo", 52, 55),
				mk_token(TOKEN_STRING, "fo", 56, 58),
				mk_token(TOKEN_PAREN_OPEN, "(", 58, 59),
				mk_token(TOKEN_STRING, "b", 59, 60),
				mk_token(TOKEN_PAREN_CLOSE, ")", 60, 61),
				mk_token(TOKEN_STRING, "ar", 61, 63),
			]);
		});
	});

	describe('#parse()', () => {
		function parse(s) {
			return ast_to_string(filter.parse(s, false));
		}
		it("empty", () => {
			assert.equal(parse(""), "((NOP))");
		});
		it("single string", () => {
			assert.equal(parse("test"), "((test))");
		});
		it("two strings implicit AND", () => {
			assert.equal(parse("test foo"), "((test AND (foo)))");
		});
		it("two strings explicit AND", () => {
			assert.equal(parse("test AND foo"), "((test AND (foo)))");
		});
		it("two strings explicit OR", () => {
			assert.equal(parse("test OR foo"), "((test) OR ((foo)))");
		});
		it("complex", () => {
			assert.equal(parse("!a OR NOT b AND c"), "(((NOT a)) OR (((NOT b) AND (c))))");
		});
		it("simple filter expression", () => {
			assert.equal(parse("a:b"), "((a:b))");
		});
		it("incomplete AND", () => {
			assert.equal(parse("test AND"), "((test AND (NOP)))");
		});
		it("incomplete AND (pre)", () => {
			assert.equal(parse("AND test"), "((NOP AND (test)))");
		});
		it("incomplete OR", () => {
			assert.equal(parse("test OR"), "((test) OR ((NOP)))");
		});
		it("incomplete NOT", () => {
			assert.equal(parse("a !"), "((a AND ((NOT NOP))))");
		});
		it("literal", () => {
			assert.equal(parse("'#! test'"), "(('#! test'))");
		});
		it("incomplete OR (pre)", () => {
			assert.equal(parse("OR test"), "((NOP) OR ((test)))");
		});
		it("inner # and !", () => {
			assert.equal(parse("a!b&&a#b"), "((a!b AND (a#b)))");
		});
		it("tag", () => {
			assert.equal(parse("#b"), "((tag:b))");
		});
		it("automatically closing parentheses", () => {
			assert.equal(parse("(a"), "((((a))))");
		});
		it("invalid filter expression 1", () => {
			assert.equal(parse("#(b)"), "((ERROR(%err_expected_string) AND (((b)))))");
		});
		it("invalid filter expression 2", () => {
			assert.equal(parse("(a) :foo b"), "((((a)) AND (ERROR(%err_unexpected_colon) AND (foo AND (b)))))");
		});
		it("invalid filter expression 3", () => {
			assert.equal(parse("(a) OR :foo b"), "((((a))) OR ((ERROR(%err_unexpected_colon) AND (foo AND (b)))))");
		});
	});

	describe('#simplify()', () => {
		function parse(s) {
			return ast_to_string(filter.parse(s, true));
		}
		it("empty", () => {
			assert.equal(parse(""), "NOP");
		});
		it("single string", () => {
			assert.equal(parse("test"), "test");
		});
		it("two strings implicit AND", () => {
			assert.equal(parse("test foo"), "(test AND foo)");
		});
		it("two strings explicit AND", () => {
			assert.equal(parse("test AND foo"), "(test AND foo)");
		});
		it("two strings explicit OR", () => {
			assert.equal(parse("test OR foo"), "(test OR foo)");
		});
		it("complex", () => {
			assert.equal(parse("!a OR NOT b AND c"), "((NOT a) OR ((NOT b) AND c))");
		});
		it("simple filter expression", () => {
			assert.equal(parse("a:b"), "a:b");
		});
		it("incomplete AND", () => {
			assert.equal(parse("test AND"), "test");
		});
		it("incomplete AND (pre)", () => {
			assert.equal(parse("AND test"), "test");
		});
		it("incomplete OR", () => {
			assert.equal(parse("test OR"), "test");
		});
		it("incomplete NOT", () => {
			assert.equal(parse("a !"), "a");
		});
		it("literal", () => {
			assert.equal(parse("'#! test'"), "'#! test'");
		});
		it("incomplete OR (pre)", () => {
			assert.equal(parse("OR test"), "test");
		});
		it("inner # and !", () => {
			assert.equal(parse("a!b&&a#b"), "(a!b AND a#b)");
		});
		it("C-style operators", () => {
			assert.equal(parse("((a) && b) c (d || c)"), "((a AND b) AND (c AND (d OR c)))");
		});
		it("tag", () => {
			assert.equal(parse("#b"), "tag:b");
		});
		it("automatically closing parentheses", () => {
			assert.equal(parse("(a"), "a");
		});
		it("invalid filter expression 1", () => {
			assert.equal(parse("#(b)"), "(ERROR(%err_expected_string) AND b)");
		});
		it("invalid filter expression 2", () => {
			assert.equal(parse("(a) :foo b"), "(a AND (ERROR(%err_unexpected_colon) AND (foo AND b)))");
		});
		it("invalid filter expression 3", () => {
			assert.equal(parse("(a) OR :foo b"), "(a OR (ERROR(%err_unexpected_colon) AND (foo AND b)))");
		});
		it("invalid filter expression 4", () => {
			assert.equal(parse("&& || !"), "NOP");
		});
	});

	describe('#canonicalize()', () => {
		function canonicalize(s) {
			return filter.canonicalize(filter.parse(s), s);
		}
		it("empty", () => {
			assert.equal(canonicalize(""), "");
		});
		it("simple", () => {
			assert.equal(canonicalize("a b c"), "a b c");
		});
		it("preserve literal strings", () => {
			assert.equal(canonicalize("a \"\\fb\" c 'test test':d"), "a \"\\fb\" c 'test test':d");
		});
		it("remove whitespace", () => {
			assert.equal(canonicalize(" a        b     c  d "), "a b c d");
		});
		it("remove non-grouping outer parentheses", () => {
			assert.equal(canonicalize("(a)"), "a");
		});
		it("remove non-grouping parentheses 1", () => {
			assert.equal(canonicalize("(a) b c"), "a b c");
		});
		it("remove non-grouping parentheses 2", () => {
			assert.equal(canonicalize("(!a) b c"), "!a b c");
		});
		it("remove non-grouping parentheses 3", () => {
			assert.equal(canonicalize("!(!!a) b c"), "!!!a b c");
		});
		it("perserve explicit outer parentheses", () => {
			assert.equal(canonicalize("(a b c)"), "(a b c)");
		});
		it("preserve grouping parentheses 1", () => {
			assert.equal(canonicalize("(a b) c"), "(a b) c");
		});
		it("preserve grouping parentheses 2", () => {
			assert.equal(canonicalize("(a b) || c"), "(a b) || c");
		});
		it("preserve grouping parentheses 3", () => {
			assert.equal(canonicalize("(a b) && c"), "(a b) && c");
		});
		it("preserve grouping parentheses 4", () => {
			assert.equal(canonicalize("((a) && b) c (d || c)"), "(a && b) c (d || c)");
		});
		it("add parentheses", () => {
			assert.equal(canonicalize("a || b && c"), "a || (b && c)");
		});
		it("parentheses and NOT", () => {
			assert.equal(canonicalize("NOT a || b && c"), "(NOT a) || (b && c)");
		});
		it("parentheses and !", () => {
			assert.equal(canonicalize("! a || b && c"), "!a || (b && c)");
		});
		it("automatically closing parentheses 1", () => {
			assert.equal(canonicalize("(a"), "a");
		});
		it("automatically closing parentheses 2", () => {
			assert.equal(canonicalize("(((a || b"), "(a || b)");
		});
		it("invalid filter expression 1", () => {
			assert.equal(canonicalize("#(b)"), "# (b)");
		});
		it("invalid filter expression 2", () => {
			assert.equal(canonicalize("(a) :foo b"), "(a) : foo b");
		});
		it("invalid filter expression 3", () => {
			assert.equal(canonicalize("(a) OR :foo b"), "(a) OR (: foo b)");
		});
		it("invalid filter expression 4", () => {
			assert.equal(canonicalize("&& || !"), "");
		});
	});

	describe('#validate()', () => {
		function validate(s) {
			const ast = filter.parse(s).validate(s, user_list);
			return [ast_to_string(ast), ast.canonicalize(s)];
		}
		it("invalid filter expression", () => {
			assert.deepEqual(validate("foo:bar"),
				["ERROR(%err_invalid_filter_expression)",
				 "foo:bar"]);
		});
		it("resolve user", () => {
			assert.deepEqual(validate("user:jdoe"),
				["user:jdoe", "user:jdoe"]);
			assert.deepEqual(validate("user:0"),
				["ERROR(%err_user_not_found)", "user:0"]);
			assert.deepEqual(validate("user:1"),
				["user:jdoe", "user:jdoe"]);
			assert.deepEqual(validate("user:jd"),
				["user:jdoe", "user:jdoe"]);
			assert.deepEqual(validate("user:Joane"),
				["user:jdoe", "user:jdoe"]);
			assert.deepEqual(validate("user:jdoe"),
				["user:jdoe", "user:jdoe"]);
			assert.deepEqual(validate("author:jdoe"),
				["author:jdoe", "author:jdoe"]);
		});
	});

	describe("#autocomplete_context()", () => {
		function context(s, i) {
			const [lhs, rhs] = filter.autocomplete_context(filter.parse(s), i);
			return [lhs.map(x => x.canonicalize(s)),
					rhs.map(x => x.canonicalize(s))];
		}

		it("empty", () => {
			assert.deepEqual(context("", 0), [[], []]);
		});

		it("simple", () => {
			assert.deepEqual(context("foo bar", 0), [[], ["foo", "bar"]]);
			assert.deepEqual(context("foo bar", 1), [[], ["foo", "bar"]]);
			assert.deepEqual(context("foo bar", 2), [[], ["foo", "bar"]]);
			assert.deepEqual(context("foo bar", 3), [["foo"], ["bar"]]);
			assert.deepEqual(context("foo bar", 4), [["foo"], ["bar"]]);
			assert.deepEqual(context("foo bar", 5), [["foo"], ["bar"]]);
			assert.deepEqual(context("foo bar", 6), [["foo"], ["bar"]]);
			assert.deepEqual(context("foo bar", 7), [["foo", "bar"], []]);
		});

		it("parantheses", () => {
			assert.deepEqual(context("foo (bar)", 0), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar)", 1), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar)", 2), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar)", 3), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar)", 4), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar)", 5), [[], ["bar"]]);
			assert.deepEqual(context("foo (bar)", 6), [[], ["bar"]]);
			assert.deepEqual(context("foo (bar)", 7), [[], ["bar"]]);
			assert.deepEqual(context("foo (bar)", 8), [[], ["bar"]]);
			assert.deepEqual(context("foo (bar)", 9), [[], []]);
		});

		it("parantheses multiple words", () => {
			assert.deepEqual(context("foo (bar boo)", 0), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar boo)", 1), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar boo)", 2), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar boo)", 3), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar boo)", 4), [[], ["foo"]]);
			assert.deepEqual(context("foo (bar boo)", 5), [[], ["bar", "boo"]]);
			assert.deepEqual(context("foo (bar boo)", 6), [[], ["bar", "boo"]]);
			assert.deepEqual(context("foo (bar boo)", 7), [[], ["bar", "boo"]]);
			assert.deepEqual(context("foo (bar boo)", 8), [["bar"], ["boo"]]);
			assert.deepEqual(context("foo (bar boo)", 9), [["bar"], ["boo"]]);
			assert.deepEqual(context("foo (bar boo)", 10), [["bar"], ["boo"]]);
			assert.deepEqual(context("foo (bar boo)", 11), [["bar"], ["boo"]]);
			assert.deepEqual(context("foo (bar boo)", 12), [["bar"], ["boo"]]);
			assert.deepEqual(context("foo (bar boo)", 13), [[], []]);
		});

		it("explicit operator", () => {
			assert.deepEqual(context("foo && bar", 0), [[], ["foo"]]);
			assert.deepEqual(context("foo && bar", 1), [[], ["foo"]]);
			assert.deepEqual(context("foo && bar", 2), [[], ["foo"]]);
			assert.deepEqual(context("foo && bar", 3), [[], ["foo"]]);
			assert.deepEqual(context("foo && bar", 4), [[], ["foo"]]);
			assert.deepEqual(context("foo && bar", 5), [[], []]);
			assert.deepEqual(context("foo && bar", 6), [[], ["bar"]]);
			assert.deepEqual(context("foo && bar", 7), [[], ["bar"]]);
			assert.deepEqual(context("foo && bar", 8), [[], ["bar"]]);
			assert.deepEqual(context("foo && bar", 9), [[], ["bar"]]);
			assert.deepEqual(context("foo && bar", 10), [["bar"], []]);
			assert.deepEqual(context("foo && bar", 11), [["bar"], []]);
		});

		it("explicit operator multiple words", () => {
			assert.deepEqual(context("glue foo && bar stool drone", 0), [[], ["glue", "foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 1), [[], ["glue", "foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 2), [[], ["glue", "foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 3), [[], ["glue", "foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 4), [["glue"], ["foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 5), [["glue"], ["foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 6), [["glue"], ["foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 7), [["glue"], ["foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 8), [["glue"], ["foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 9), [["glue"], ["foo"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 10), [[], []]);
			assert.deepEqual(context("glue foo && bar stool drone", 11), [[], ["bar", "stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 12), [[], ["bar", "stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 13), [[], ["bar", "stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 14), [[], ["bar", "stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 15), [["bar"], ["stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 16), [["bar"], ["stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 17), [["bar"], ["stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 18), [["bar"], ["stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 19), [["bar"], ["stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 20), [["bar"], ["stool", "drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 21), [["bar", "stool"], ["drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 22), [["bar", "stool"], ["drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 23), [["bar", "stool"], ["drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 24), [["bar", "stool"], ["drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 25), [["bar", "stool"], ["drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 26), [["bar", "stool"], ["drone"]]);
			assert.deepEqual(context("glue foo && bar stool drone", 27), [["bar", "stool", "drone"], []]);
		});

		it("filter expression", () => {
			assert.deepEqual(context("user:foo bar", 0), [[], []]);
			assert.deepEqual(context("user:foo bar", 1), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 2), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 3), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 4), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 5), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 6), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 7), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar", 8), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar", 9), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar", 10), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar", 11), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar", 12), [["user:foo", "bar"], []]);
		});

		it("multiple filter expressions", () => {
			assert.deepEqual(context("user:foo bar #a b", 0), [[], []]);
			assert.deepEqual(context("user:foo bar #a b", 1), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 2), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 3), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 4), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 5), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 6), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 7), [[], ["user:foo", "bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 8), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 9), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 10), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 11), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 12), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 13), [["user:foo"], ["bar"]]);
			assert.deepEqual(context("user:foo bar #a b", 14), [[], ["#a", "b"]]);
			assert.deepEqual(context("user:foo bar #a b", 15), [["#a"], ["b"]]);
			assert.deepEqual(context("user:foo bar #a b", 16), [["#a"], ["b"]]);
			assert.deepEqual(context("user:foo bar #a b", 17), [["#a", "b"], []]);
		});
	});

	describe("#serialize()", () => {
		function serialize(s) {
			return filter.parse(s).validate(s, user_list).serialize();
		}

		it("chain of words 1", () => {
			assert.deepEqual(serialize("foo bar"),
				["&", "foo", "bar"]);
		});

		it("chain of words 2", () => {
			assert.deepEqual(serialize("foo bar foom"),
				["&", "foo", "bar", "foom"]);
		});

		it("or operator", () => {
			assert.deepEqual(serialize("foo bar foom || foo2"),
				["|", ["&", "foo", "bar", "foom"], "foo2"]);
		});

		it("not operator", () => {
			assert.deepEqual(serialize("!foo bar foom || foo2"),
				["|", ["&", ["!", "foo"], "bar", "foom"], "foo2"]);
		});

		it("user filter", () => {
			assert.deepEqual(serialize("!foo bar || user:jdoe"),
				["|", ["&", ["!", "foo"], "bar"], {"user": 1}]);
		});

		it("date filter", () => {
			assert.deepEqual(serialize("!foo bar || date:2019"),
				["|", ["&", ["!", "foo"], "bar"],
				{"date": [1546300800000, 1577836799999]}]);
		});

		it("tag filter", () => {
			assert.deepEqual(serialize("#foo (#bar || bar)"),
				["&", ["#", "foo"], ["|", ["#", "bar"], "bar"]]);
		});
	});
});
