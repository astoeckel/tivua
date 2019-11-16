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
 * @file filter.js
 *
 * This file provides client-side support for arbitrary filter expressions.
 * In particular, implements the tivua.filter.parse class, that turns a filter
 * expression into a filter tree that can be serialized and sent to the server.
 * Furthermore provides support for the auto-completion of filter expression
 * while they are being edited.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.filter = (function () {
	"use strict";

	/**************************************************************************
	 * TOKENIZER                                                              *
	 ********************************++++**************************************/

	/* Tokenizer states */
	const STATE_INIT = 1;
	const STATE_WHITESPACE = 2;
	const STATE_TEXT = 3;
	const STATE_LITERAL = 4;
	const STATE_LITERAL_ESCAPE = 5;

	/* Token types */
	const TOKEN_STRING = 1;
	const TOKEN_LITERAL = 2;
	const TOKEN_PAREN_OPEN = 3;
	const TOKEN_PAREN_CLOSE = 4;
	const TOKEN_COLON = 5;
	const TOKEN_HASH = 6;
	const TOKEN_AND = 7;
	const TOKEN_OR = 8;
	const TOKEN_NOT = 9;
	const TOKEN_END = 255;

	/* Lookup table for translating operators to token types */
	const TOKEN_OP_DICT = {
		"and": TOKEN_AND,
		"or": TOKEN_OR,
		"not": TOKEN_NOT,
	};

	/**
	 * The Token class represents a single token emitted by the tokenizer.
	 * Tokens contain information about their original location in the source
	 * text and the token type.
	 */
	class Token {
		constructor(i, type, text) {
			text = text ? text : "";
			this.start = i;
			this.end = i + text.length;
			this.type = type;
			this.text = text;
		}

		push(c) {
			this.end += 1;
			this.text += c;
		}
	}

	/**
	 * Returns a token representing the end of the token stream.
	 */
	function EndToken(i) {
		let token = new Token(i, TOKEN_END);
		token.end = token.start = i;
		return token;
	}

	/**
	 * Turns the given string "s" into a list of tokens. The tokens contain
	 * sufficient information to reconstruct the original string "s" without
	 * superfluous whitespace.
	 *
	 * @param str s is the string that should be tokenized.
	 */
	function tokenize(s) {
		let state = STATE_INIT; /* Current tokenizer state */
		let literal_char = 0; /* Start of the current string literal {",'} */
		const tokens = []; /* Result list of tokens */
		let token = [null]; /* The current token, wrapped in an array */

		/* The emit function writes the current token to the token output
		   stream. */
		const emit = (i, new_token_type, text) => {
			/* Push the current token (if one is available) onto the result
			   list. */
			const t = token[0];
			if (t) {
				/* Convert logic operators into the corresponding token */
				if (t.type == TOKEN_STRING) {
					let text = t.text.toLowerCase();
					if (text in TOKEN_OP_DICT) {
						t.type = TOKEN_OP_DICT[text];
					}
				}
				tokens.push(t);
			}

			/* Create a new token, in case a new token is requested */
			if (new_token_type) {
				token[0] = new Token(i, new_token_type, text);
			} else {
				token[0] = null;
			}
		};

		/* Iterate over each character in the given string and progress through
		   the tokenizer state machine while doing so. */
		for (let i = 0; i < s.length; i++) {
			const c = s.charAt(i);
			switch (state) {
				case STATE_INIT:
				case STATE_WHITESPACE:
				case STATE_TEXT:
					switch (c) {
						case ":":
							emit(i, TOKEN_COLON, c);
							state = STATE_INIT;
							continue;
						case "(":
							emit(i, TOKEN_PAREN_OPEN, c);
							state = STATE_INIT;
							continue;
						case ")":
							emit(i, TOKEN_PAREN_CLOSE, c);
							state = STATE_INIT;
							continue;
						case "\"":
						case "'":
							emit(i, TOKEN_LITERAL);
							state = STATE_LITERAL;
							literal_char = c;
							continue;
						case " ":
						case "\t":
						case "\n":
						case "\r":
						case "\v":
							if (state == STATE_TEXT) {
								emit();
								state = STATE_WHITESPACE;
							}
							continue;
						default:
							if (state != STATE_TEXT) {
								if (c == "#") {
									emit(i, TOKEN_HASH, c);
									state = STATE_INIT;
									continue;
								} else if (c == "!") {
									emit(i, TOKEN_NOT, c);
									state = STATE_INIT;
									continue;
								}
								emit(i, TOKEN_STRING);
							}
							state = STATE_TEXT;
							token[0].push(c);
							continue;
					}
					break;
				case STATE_LITERAL:
					switch (c) {
						case literal_char:
							token[0].end = i + 1;
							emit();
							state = STATE_INIT;
							continue;
						case "\\":
							state = STATE_LITERAL_ESCAPE;
							continue;
						default:
							token[0].push(c);
							continue;
					}
					break;
				case STATE_LITERAL_ESCAPE:
					token[0].push(c, 0);
					state = STATE_LITERAL;
					continue;
			}
		}

		/* Emit the currently active token */
		emit();

		return tokens;
	}

	/**************************************************************************
	 * PARSER                                                                 *
	 ********************************++++**************************************/

	const NODE_WORD = 1;
	const NODE_FILTER = 2;
	const NODE_AND = 3;
	const NODE_OR = 4;
	const NODE_NOT = 5;
	const NODE_ERR = 255;

	class ParserNode {
		constructor(type, ...children) {
			this.type = type;
			this.children = children;
		}

		toString() {
			if (this.type == NODE_AND) {
				return "(" + this.children.map(x => x.toString()).join(" AND ") + ")";
			} else if (this.type == NODE_OR) {
				return "(" + this.children.map(x => x.toString()).join(" OR ") + ")";
			} else if (this.type == NODE_NOT) {
				return "(NOT " + this.children[0].toString() + ")";
			} else if (this.type == NODE_WORD) {
				return this.value.text;
			} else if (this.type == NODE_FILTER) {
				if (this.name.type == TOKEN_HASH) {
					return "tag:" + this.value.text;
				}
				return this.name.text + ":" + this.value.text;
			} else if (this.type == NODE_ERR) {
				return "ERROR(" + this.msg + ")";
			}
			return "";
		}
	};

	/**
	 * Internal class implementing the actual parsing.
	 */
	class Parser {
		/**
		 * Constructor of the ParserState class. Takes a list of tokens and
		 * and initialises the internal state.
		 */
		constructor() {
			this.idx = 0;
			this.str = "";
			this.tokens = [];
		}

		/**
		 * Returns the next token without advancing the current token stream
		 * cursor.
		 */
		peek() {
			return (this.idx < this.tokens.length) ?
				this.tokens[this.idx] : EndToken(this.str.length);
		}

		/**
		 * Returns the current token and advances the token stream cursor.
		 */
		consume() {
			return (this.idx < this.tokens.length) ?
				this.tokens[this.idx++] : EndToken(this.str.length);
		}

		/**
		 * Returns true if there is a next token, false otherwise.
		 */
		has_next() {
			return this.idx < this.tokens.length;
		}

		/**
		 * Creates an AST node representing an error.
		 */
		_error_node(msg, ...children) {
			let node = new ParserNode(NODE_ERR, ...children);
			node.msg = msg;
			node.token = this.consume();
			return node;
		}

		/**
		 * Parses a single word.
		 */
		_parse_word() {
			if ((this.peek().type == TOKEN_STRING) ||
			    (this.peek().type == TOKEN_LITERAL)) {
				return this.consume();
			}
			return this._error_node("%err_expected_value");
		}

		/**
		 * Parses a single filter expression, including single words and filters
		 * of the form "name:value".
		 */
		_parse_filter() {
			let v1 = null, v2 = null, res = null;
			if (this.peek().type == TOKEN_HASH) {
				v1 = this.consume();
				v2 = this._parse_word();
			} else {
				v1 = this._parse_word();
				if (this.peek().type == TOKEN_COLON) {
					this.consume();
					v2 = this._parse_word();
				}
			}
			if (v1 && v2) {
				res = new ParserNode(NODE_FILTER);
				res.name = v1;
				res.value = v2;
			} else {
				res = new ParserNode(NODE_WORD);
				res.value = v1;
			}
			console.log(this.peek());
			return res;
		}

		/**
		 * Parses a negation expression.
		 */
		_parse_not_expr() {
			if ((this.peek().type == TOKEN_NOT)) {
				this.consume();
				return new ParserNode(NODE_NOT, this._parse_parens_expr());
			}
			return this._parse_filter();
		}

		/**
		 * Parses expressions with parentheses.
		 */
		_parse_parens_expr() {
			if (this.peek().type == TOKEN_PAREN_OPEN) {
				this.consume();
				const node = this._parse_expr();
				if (this.peek().type != TOKEN_PAREN_CLOSE) {
					return this._error_node("%err_expected_paren_close");
				}
				this.consume();
				return node;
			}
			return this._parse_not_expr();
		}


		/**
		 * Parses expressions connected by "AND".
		 */
		_parse_and_expr() {
			const node = new ParserNode(NODE_AND, this._parse_parens_expr());
			while (true) {
				console.log("!->", this.peek().type);
				if (this.peek().type == TOKEN_AND) {
					this.consume();
					node.children.push(this._parse_parens_expr());
				} else if ((this.peek().type == TOKEN_STRING) ||
						   (this.peek().type == TOKEN_LITERAL) ||
						   (this.peek().type == TOKEN_HASH) ||
						   (this.peek().type == TOKEN_NOT)) {
					console.log("-->");
					node.children.push(this._parse_parens_expr());
				} else {
					break;
				}
			}
			return node;
		}

		/**
		 * Parses expressions connected by "OR".
		 */
		_parse_or_expr() {
			const node = new ParserNode(NODE_OR, this._parse_and_expr());
			while (true) {
				if (this.peek().type == TOKEN_OR) {
					this.consume();
					node.children.push(this._parse_and_expr());
				} else {
					break;
				}
			}
			return node;
		}

		/**
		 * Parses an outermost expression.
		 */
		_parse_expr() {
			/* Start with the operator with the smallest precedence */
			return this._parse_or_expr();
		}

		/**
		 * Parses the given string.
		 */
		parse(str) {
			/* Reset all local variables */
			this.idx = 0;
			this.str = str;

			/* Turn the token into a token list */
			this.tokens = tokenize(str);

			/* Parse an outer expression */
			return this._parse_expr();
		}
	}

	/**
	 * Parses the given string into an abstract syntax tree. This abstract
	 * syntax can be serialised into a compact JSON representation that can be
	 * sent to the server.
	 */
	function parse(s) {
		/* Turn the given string into an array of tokens and pass it into the
		   ParserState class that does the actual parsing. */
		return (new Parser()).parse(s);
	}

	/**************************************************************************
	 * FILTER                                                                 *
	 **************************************************************************/

	class Filter {
		simplify() {
			return this;
		}
	}

	class FilterNoOp extends Filter {
	}

	class FilterBinaryOp extends Filter {
		simplify() {
			return (this.exprs.length == 0) ? FilterNoOp() :
				((this.exprs.length == 1) ? this.exprs[1] : this);
		}
	}

	class FilterOr extends FilterBinaryOp {
		constructor(...exprs) {
			this.op = "OR";
			this.exprs = exprs;
		}
	}

	class FilterAnd extends FilterBinaryOp {
		constructor(...exprs) {
			this.op = "AND";
			this.exprs = exprs;
		}
	}


	return {
		"parse": parse,
		"tokenize": tokenize,
		"Token": Token,
		"TOKEN_STRING": TOKEN_STRING,
		"TOKEN_LITERAL": TOKEN_LITERAL,
		"TOKEN_PAREN_OPEN": TOKEN_PAREN_OPEN,
		"TOKEN_PAREN_CLOSE": TOKEN_PAREN_CLOSE,
		"TOKEN_COLON": TOKEN_COLON,
		"TOKEN_HASH": TOKEN_HASH,
		"TOKEN_AND": TOKEN_AND,
		"TOKEN_OR": TOKEN_OR,
		"TOKEN_NOT": TOKEN_NOT,
		"TOKEN_END": TOKEN_END,
	};
})();