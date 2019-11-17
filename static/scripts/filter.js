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
		"AND": TOKEN_AND,
		"OR": TOKEN_OR,
		"NOT": TOKEN_NOT,
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
					if (t.text in TOKEN_OP_DICT) {
						t.type = TOKEN_OP_DICT[t.text];
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
							if (c == "&" && s.charAt(i + 1) == "&") {
								emit(i, TOKEN_AND, "&&");
								state = STATE_INIT;
								i++;
								continue;
							} else if (c == "|" && s.charAt(i + 1) == "|") {
								emit(i, TOKEN_OR, "||");
								state = STATE_INIT;
								i++;
								continue;
							}
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

	const LITERAL_REQUIRED_RE = /(["']|^[#!]|\s|&&|\|\|)/;

	const NODE_WORD = 1;
	const NODE_FILTER = 2;
	const NODE_AND = 3;
	const NODE_OR = 4;
	const NODE_NOT = 5;
	const NODE_NOP = 6;
	const NODE_ERR = 7;

	/**
	 * The ASTNode class represents a node in the abstract syntax tree (AST).
	 *
	 * This class shouldn't be used directly outside of this module, but instead
	 * passed to exported functions that transform the AST into something more
	 * useful.
	 *
	 * Each node has a type and a list of children. Certain nodes posess
	 * specialies members, in particular "NODE_WORD" nodes have a "value"
	 * member, "NODE_FILTER" nodes have a both a "value" and "key" member.
	 * These members refer to a token in the parse tree. Furthermore, the
	 * special "NODE_ERR" node has a localisable string "msg" as member, as well
	 * as a the token "member". Some nodes may have a "token" member refering to
	 * the token that generated the node in the first place.
	 */
	class ASTNode {
		/**
		 * Creates a new instance of the ASTNode class.
		 *
		 * @param {int} type is one of the type constants defined above.
		 * @param  {...any} children is a list of child nodes.
		 */
		constructor(type, ...children) {
			this.type = type;
			this.children = children;
			this.explicit_parens = false;
			this.token = null; /* Set if there is an explicit token */
			this.value = null;
			this.key = null;
		}

		/**
		 * Simplifies the AST (modifying it), where NOPs and one-element
		 * logic nodes are removed.
		 *
		 * Note: This function is not intended to perform many semantic
		 * simplifications. Instead, this is supposed to remove some artifacts
		 * that arise from the particular grammar that is used to parse the
		 * strings, such as AND and OR nodes with only one child or NOP nodes
		 * arising from incomplete expressions.
		 */
		simplify() {
			/* Actual implementation of simplify */
			const _simplify = () => {
				/* Simplify all child nodes, then, discard NOP nodes */
				this.children = this.children
					.map(x => x.simplify())
					.filter(x => x.type != NODE_NOP);
				const n_children = this.children.length;

				/* Reduce logic nodes to NOPs in case there are no child nodes */
				if ((n_children == 0) && ((this.type == NODE_AND) ||
										(this.type == NODE_OR) ||
										(this.type == NODE_NOT))) {
					return new ASTNode(NODE_NOP);
				}

				/* If there is only one child, and this is an AND or OR, just return
				the child. */
				if ((n_children == 1) && ((this.type == NODE_AND) ||
										(this.type == NODE_OR))) {
					return this.children[0];
				}

				return this;
			};

			/* Preserve the "explicit parentheses" flag */
			const res = _simplify();
			res.explicit_parens = this.explicit_parens || res.explicit_parens;
			return res;
		}
	}

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
		_error_node(msg, token, ...children) {
			let node = new ASTNode(NODE_ERR, ...children);
			node.msg = msg;
			node.token = token;
			return node;
		}

		/**
		 * Parses a single word and returns the corresponding token (not an
		 * ASTNode) or NULL if there is no string or literal token following.
		 */
		_parse_word() {
			if ((this.peek().type == TOKEN_STRING) ||
			    (this.peek().type == TOKEN_LITERAL)) {
				return this.consume();
			}
			return null;
		}

		/**
		 * Parses a single filter expression, including single words and filters
		 * of the form "name:value".
		 */
		_parse_filter() {
			let v1 = null, v2 = null, v2_required = false;
			if (this.peek().type == TOKEN_HASH) {
				v1 = this.consume();
				v2_required = true;
			} else {
				v1 = this._parse_word();
				if (this.peek().type == TOKEN_COLON) {
					this.consume();
					v2_required = true;
				}
			}
			if (v2_required) {
				v2 = this._parse_word();
				if (!v2) {
					return this._error_node("%err_expected_string", v1);
				}
			}
			if (v1 && v2) {
				const res = new ASTNode(NODE_FILTER);
				res.key = v1;
				res.value = v2;
				return res;
			} else if (v1) {
				const res = new ASTNode(NODE_WORD);
				res.value = v1;
				return res;
			}
			return new ASTNode(NODE_NOP);
		}

		/**
		 * Parses a negation expression.
		 */
		_parse_not_expr() {
			if ((this.peek().type == TOKEN_NOT)) {
				const token = this.consume();
				const node = new ASTNode(NODE_NOT, this._parse_parens_expr());
				node.token = token;
				return node;
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
				node.explicit_parens = true;
				if (this.peek().type != TOKEN_PAREN_CLOSE) {
					node.children.push(this._error_node("%err_expected_paren_close", this.peek()));
				} else {
					this.consume();
				}
				return node;
			} else if (this.peek().type == TOKEN_COLON) {
				return this._error_node("%err_unexpected_colon", this.consume());
			}
			return this._parse_not_expr();
		}


		/**
		 * Parses expressions connected by "AND".
		 */
		_parse_and_expr() {
			const node = new ASTNode(NODE_AND, this._parse_parens_expr());
			if (this.peek().type == TOKEN_AND) {
				node.token = this.consume();
				node.children.push(this._parse_and_expr());
			} else if ((this.peek().type == TOKEN_STRING) ||
						(this.peek().type == TOKEN_LITERAL) ||
						(this.peek().type == TOKEN_HASH) ||
						(this.peek().type == TOKEN_NOT) ||
						(this.peek().type == TOKEN_COLON) ||
						(this.peek().type == TOKEN_PAREN_OPEN)) {
				node.children.push(this._parse_and_expr());
			}
			return node;
		}

		/**
		 * Parses expressions connected by "OR".
		 */
		_parse_or_expr() {
			const node = new ASTNode(NODE_OR, this._parse_and_expr());
			if (this.peek().type == TOKEN_OR) {
				node.token = this.consume();
				node.children.push(this._parse_or_expr());
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
		 * Parses the given string and returns the abstract syntax tree composed
		 * of ASTNode instances.
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
	 * Parses the given string into an abstract syntax tree. The resulting
	 * syntax tree can either be converted to a filter tree, converted to a
	 * canonical version of the string, or used for autocompletion.
	 *
	 * @param s is the string that should be parsed.
	 * @param simplify if true (default, if not given) calls the simplify()
	 *        method on the ast before returning it. This should be left at
	 *        "true" and setting it to "false" is only used in the unit tests.
	 */
	function parse(s, simplify) {
		const ast = (new Parser()).parse(s);
		return (simplify === undefined || simplify) ? ast.simplify() : ast;
	}

	/**
	 * The canonicalize() function normalizes whitespace and parentheses in the
	 * filter expression. Parentheses are added in a way that clarifies the
	 * precedence of the operators.
	 *
	 * @param ast is the abstract syntax tree returned by parse().
	 * @param s is the original string passed to parse(). This is required to
	 *          select the original version of the string that was typed
	 */
	function canonicalize(ast, s, transform, join) {
		/**
		 * Escapes a string to a literal in case it contains a forbidden
		 * sequence.
		 */
		function _escape(s) {
			if (s.match(LITERAL_REQUIRED_RE)) {
				return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"';
			}
			return s;
		}

		/**
		 * Either returns the original text that generated the given token,
		 * or, if no such information is vailable, returns the text stored
		 * in the "text" property of the token. Also, if the token has been
		 * substituted by a string (which is used when autocompleting a
		 * string in the UI), just return the (potentially escaped) string.
		 */
		function _get_text(t) {
			if (!s || typeof t == "string") {
				return _escape(t);
			}
			return s.substring(t.start, t.end);
		}

		/* Note: this code works, but was removed because "(a) : b" is an
			error condition, but would have been converted to "a : b",
			which is equal to "a:b", which is NOT an error condition.
			This this would have changed the semantics. */
		/* Returns true if there is at least one operator in the group with
			at least two children. */
		/*const _is_nontrival_group = nd => nd.children.reduce(
			(b, x) => b || x.children.length >= 2 || _is_nontrival_group(x),
			nd.children.length >= 2);*/

		function _canonicalize(nd) {
			/* Canoncialises a child and decides whether to place parentheses
			   around it or not. Parentheses are placed if they were explicitly
			   placed by the user, or around dissimilar operators. */
			function _canonicalize_child(child) {
				if ((child.explicit_parens /*&& _is_nontrival_group(child)*/) ||
					((child.type != nd.type) &&
					 ((child.type == NODE_NOT && child.token.text != "!") ||
					  (child.type == NODE_OR) ||
					  (child.type == NODE_AND)))) {
					return "(" + _canonicalize(child) + ")";
				}
				return _canonicalize(child);
			}

			switch (nd.type) {
				case NODE_WORD:
					return _get_text(nd.value);
				case NODE_FILTER: {
					const right = _get_text(nd.value);
					if (_get_text(nd.key) == "#") {
						return "#" + right;
					}
					const left = _get_text(nd.key);
					return left + ":" + right;
				}
				case NODE_AND:
				case NODE_OR: {
						const left = _canonicalize_child(nd.children[0]);
					const right = _canonicalize_child(nd.children[1]);
					const mid = nd.token ? _get_text(nd.token) : null;
					return [left, mid, right].filter(x => x).join(" ");
				}
				case NODE_NOT: {
					const t = _get_text(nd.token);
					return t + (t == "!" ? "" : " ") +
						_canonicalize_child(nd.children[0]);
				}
				case NODE_NOP:
					return "";
				case NODE_ERR:
					if (nd.token) {
						return _get_text(nd.token);
					}
					return "";
			}
		}

		/* Call the internal version of _canonicalize on the AST. We assume that
		   the AST is a proper binary tree, which is ensured by simplify, which
		   removes invalid zero-ary and unary AND and OR operators. */
		return _canonicalize(ast.simplify());
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
		"tokenize": tokenize,
		"parse": parse,
		"canonicalize": canonicalize,
	};
})();