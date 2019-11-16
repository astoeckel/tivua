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

describe('Filter', () => {
	describe('#tokenize()', () => {
		function mk_token(type, text, start, end) {
			let token = new filter.Token();
			token.type = type;
			token.text = text;
			token.start = start;
			token.end = end;
			return token;
		}

		it("simple token string", () => {
			assert.deepEqual(filter.tokenize("test"),
				[mk_token(filter.TOKEN_STRING, "test", 0, 4)]);
		});

		it("literal starting with \"", () => {
			assert.deepEqual(filter.tokenize("\"test \\\" AND NOT # !\""),
				[mk_token(filter.TOKEN_LITERAL, "test \" AND NOT # !", 0, 21)]);
		});

		it("literal starting with \'", () => {
			assert.deepEqual(filter.tokenize("'test \\\\\\\' AND NOT # !'"),
				[mk_token(filter.TOKEN_LITERAL, "test \\\' AND NOT # !", 0, 23)]);
		});

		it("long test string", () => {
			assert.deepEqual(filter.tokenize("te#st te!st te:st not \"NOT\" (foo oR bar AND) #test !foo fo(b)ar"),
			[
				mk_token(filter.TOKEN_STRING, "te#st", 0, 5),
				mk_token(filter.TOKEN_STRING, "te!st", 6, 11),
				mk_token(filter.TOKEN_STRING, "te", 12, 14),
				mk_token(filter.TOKEN_COLON, ":", 14, 15),
				mk_token(filter.TOKEN_STRING, "st", 15, 17),
				mk_token(filter.TOKEN_NOT, "not", 18, 21),
				mk_token(filter.TOKEN_LITERAL, "NOT", 22, 27),
				mk_token(filter.TOKEN_PAREN_OPEN, "(", 28, 29),
				mk_token(filter.TOKEN_STRING, "foo", 29, 32),
				mk_token(filter.TOKEN_OR, "oR", 33, 35),
				mk_token(filter.TOKEN_STRING, "bar", 36, 39),
				mk_token(filter.TOKEN_AND, "AND", 40, 43),
				mk_token(filter.TOKEN_PAREN_CLOSE, ")", 43, 44),
				mk_token(filter.TOKEN_HASH, "#", 45, 46),
				mk_token(filter.TOKEN_STRING, "test", 46, 50),
				mk_token(filter.TOKEN_NOT, "!", 51, 52),
				mk_token(filter.TOKEN_STRING, "foo", 52, 55),
				mk_token(filter.TOKEN_STRING, "fo", 56, 58),
				mk_token(filter.TOKEN_PAREN_OPEN, "(", 58, 59),
				mk_token(filter.TOKEN_STRING, "b", 59, 60),
				mk_token(filter.TOKEN_PAREN_CLOSE, ")", 60, 61),
				mk_token(filter.TOKEN_STRING, "ar", 61, 63),
			]);
		});
	});
});
