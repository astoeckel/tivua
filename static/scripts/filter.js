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
this.tivua.filter = (function (global) {
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
			this.token_paren_open = null;
			this.token_paren_close = null;
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

			/* Preserve the "explicit parentheses" flag, as well as the tokens
			   that indicated the opening and closing parentheses. */
			const res = _simplify();
			if (res.explicit_parens) {
				res.explicit_parens = true;
				res.token_paren_open = res.token_paren_open;
				res.token_paren_close = res.token_paren_close;
			}
			if (this.explicit_parens) {
				res.explicit_parens = true;
				res.token_paren_open = this.token_paren_open || res.token_paren_open;
				res.token_paren_close = this.token_paren_close || res.token_paren_close;
			}
			return res;
		}

		/**
		 * Creates a deep or shallow copy of the tree.
		 */
		clone(deep) {
			/* Per default, create a deep copy */
			deep = deep === undefined ? true : !!deep;

			/* Helper function used to clone an individual token */
			function _clone_token(t) {
				if (!t) {
					return null;
				}
				let res = new Token();
				res.start = t.start;
				res.end = t.end;
				res.type = t.type;
				res.text = t.text;
				return res;
			}

			/* Create a new AST node and copy the properties over */
			const res = new ASTNode(this.type);
			res.children = deep ? this.children.map(x => x.clone()) : this.children;
			res.explicit_parens = this.explicit_parens;
			res.token_paren_open = _clone_token(this.token_paren_open);
			res.token_paren_close = _clone_token(this.token_paren_close);
			res.token = _clone_token(this.token);
			res.value = _clone_token(this.value);
			res.key = _clone_token(this.key);
			return res;
		}

		/**
		 * Returns a copy of this tree where the first node in the list is
		 * replaced with the given replacement and all other nodes in the list
		 * are replaced with NOPs.
		 */
		replace(nodes, replacement) {
			function _replace(nd) {
				/* First check whether this is one of the nodes that should be
				   replaced */
				if (nd == nodes[0]) {
					return replacement;
				}
				for (let i = 1; i < nodes.length; i++) {
					if (nd == nodes[i]) {
						return new ASTNode(NODE_NOP);
					}
				}

				/* Otherwise just perform a shallow copy of this node and
				   run this function on all children */
				let res = nd.clone(false);
				res.children = nd.children.map(_replace);
				return res;
			}
			return _replace(this).simplify();
		}

		/**
		 * Detaches the AST from the underlying string by replacing tokens with
		 * plain strings.
		 */
		detach_from_string() {
			function _detach_token(t) {
				return t ? (typeof t == "string" ? t : t.text) : null;
			}
			this.token_paren_open = _detach_token(this.token_paren_open);
			this.token_paren_close = _detach_token(this.token_paren_close);
			this.token = _detach_token(this.token);
			this.value = _detach_token(this.value);
			this.key = _detach_token(this.key);
			this.children = this.children.map(x => x.detach_from_string());
			return this;
		}

		/**
		 * Returns a string representation of the type.
		 */
		describe() {
			switch (this.type) {
				case NODE_WORD:
					return "word";
				case NODE_FILTER:
					return "filter";
				case NODE_ERR:
					return "error";
				case NODE_AND:
				case NODE_OR:
					return "binary_op";
				case NODE_NOT:
					return "unary_op";
				default:
					return null;
			}
		}

		/**
		 * Returns all the full-text search terms in the AST node.
		 */
		words() {
			if (this.type == NODE_WORD) {
				let t = this.value;
				return [typeof t == "string" ? t : t.text];
			}
			return this.children.map(x => x.words()).reduce(
				(a, b) => a.concat(b), []);
		}

		/**
		 * Returns the first error node in the tree or null if there is none.
		 */
		get_first_error() {
			return this.children.reduce(
				(msg, x) =>
					msg ||
					(x.type == NODE_ERR ? x : null) ||
					x.get_first_error(),
				this.type == NODE_ERR ? this : null);
		}

		/**
		 * Calls the global "tivua.filter.canonicalize" function on this node.
		 */
		canonicalize(s, transform, join) {
			return global.tivua.filter.canonicalize(this, s, transform, join);
		}

		/**
		 * Calls the global "tivua.filter.validate" function on this node.
		 */
		validate(s, user_list) {
			return global.tivua.filter.validate(this, s, user_list);
		}

		/**
		 * Calls the globel "tivua.filter.autocomplete_context" function on this
		 * node.
		 */
		autocomplete_context(i) {
			return global.tivua.filter.autocomplete_context(this, i);
		}

		/**
		 * Returns a JSON object representing the filter expression. This is
		 * what is being sent to the server.
		 */
		serialize() {
			return global.tivua.filter.serialize(this);
		}

		/**
		 * Removes duplicate nodes combined via "AND".
		 */
		remove_duplicates(s) {
			return global.tivua.filter.remove_duplicates(this, s);
		}

		/**
		 * Creates a new AST that is combined with the given node via an
		 * implicit "and".
		 */
		and(other) {
			return new ASTNode(NODE_AND, this, other);
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
			let v1 = null, v2 = null, v2_required = false, err_token = null;
			if (this.peek().type == TOKEN_HASH) {
				v1 = err_token = this.consume();
				v2_required = true;
			} else {
				v1 = this._parse_word();
				if (this.peek().type == TOKEN_COLON) {
					err_token = this.consume();
					v2_required = true;
				}
			}
			if (v2_required) {
				v2 = this._parse_word();
				if (!v2) {
					v1.end = err_token.end;
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
				let token_paren_open = this.consume();
				const node = this._parse_expr();
				node.explicit_parens = true;
				node.token_paren_open = token_paren_open;
				node.token_paren_close = null;
				if ((this.peek().type == TOKEN_PAREN_CLOSE) ||
				    (this.peek().type == TOKEN_END)) {
					node.token_paren_close = this.consume();
				} else {
					node.children.push(this._error_node("%err_expected_paren_close", this.peek()));
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
	 * The optional parameters "transform" and "join" can be used to transduce
	 * the canonicalised AST into another tree, such as a DOM tree.
	 *
	 * @param ast is the abstract syntax tree returned by parse().
	 * @param s is the original string passed to parse(). This is required to
	 *        select the original version of the string that was typed
	 * @param transform is a function that takes a string s and an optional node
	 *        reference nd, and returns some object.
	 * @param join is a function that takes a set of objects previously created
	 *        by join and/or transform and creates a new object.
	 */
	function canonicalize(ast, s, transform, join) {
		/* Default parameters */
		transform = (transform === undefined) ? ((s, _) => s) : transform;
		join = (join === undefined) ? ((sep, arr) => arr.join(sep)) : join;

		/* Some shorthands for transform and join */
		const fT = (s, nd) => transform(s, (nd === undefined) ? null : nd);
		const fJ = (sep, ...arr) => join(sep, arr.filter(x => x));

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
		 * or, if the token has been substituted by a string (which is used when
		 * autocompleting a string in the UI), just return the (potentially
		 * escaped) string.
		 */
		function _get_text(t, escape) {
			escape = (escape === undefined) ? true : !!escape;
			if (!s || typeof t == "string") {
				return escape ? _escape(t) : t;
			}
			return s.substring(t.start, t.end);
		}

		/* Returns true if there is at least one operator in the group with at
			least two children. */
		const _is_nontrival_group = nd => nd.children.reduce(
			(b, x) => b || x.children.length >= 2 || _is_nontrival_group(x),
			nd.children.length >= 2);

		/* Function which is used to check whether the tree has an error. If
		   yes, some transformations need to be disabled, to ensure that the
		   code still maintains semantics. In particlar, "(a) : b", which is an
			error condition, would be converted to "a : b", which is equal to
			"a:b", which is NOT an error condition. This this would have changed
			the semantics. */
		const has_error = !!ast.get_first_error();

		/* Canoncialises a child and decides whether to place parentheses
			around it or not. Parentheses are placed if they were explicitly
			placed by the user, or around dissimilar operators. */
		function _canonicalize_child(child, parent_type) {
			if ((child.explicit_parens && (_is_nontrival_group(child) ||
											has_error)) ||
				((child.type != parent_type) &&
					((child.type == NODE_NOT && child.token.text != "!") ||
					(child.type == NODE_OR) ||
					(child.type == NODE_AND)))) {
				return fJ("", fT("("), _canonicalize(child), fT(")"));
			}
			return _canonicalize(child);
		}

		/* Internal implementation of canonicalize. */
		function _canonicalize(nd) {
			switch (nd.type) {
				case NODE_WORD:
					return fT(_get_text(nd.value), nd);
				case NODE_FILTER: {
					const right = _get_text(nd.value);
					if (_get_text(nd.key, false) == "#") {
						return fJ("", fT("#" + right, nd));
					}
					const left = _get_text(nd.key);
					return fT(left + ":" + right, nd);
				}
				case NODE_AND:
				case NODE_OR: {
					const left = _canonicalize_child(nd.children[0], nd.type);
					const right = _canonicalize_child(nd.children[1], nd.type);
					const mid = nd.token ? fT(_get_text(nd.token), nd) : null;
					return fJ(" ", left, mid, right);
				}
				case NODE_NOT: {
					const t = _get_text(nd.token);
					return fJ(t == "!" ? "" : " ",
							  fT(t, nd),
							  _canonicalize_child(nd.children[0], nd.type));
				}
				case NODE_NOP:
					return fT("", nd);
				case NODE_ERR:
					if (nd.token) {
						return fT(_get_text(nd.token, false), nd);
					}
					return fT("", nd);
			}
		}

		/* Call the internal version of _canonicalize on the AST. We assume that
		   the AST is a proper binary tree, which is ensured by simplify, which
		   removes invalid zero-ary and unary AND and OR operators. */
		ast = ast.simplify();
		return _canonicalize_child(ast, ast.type);
	}

	/**************************************************************************
	 * DUPLICATE ELIMINATION                                                  *
	 **************************************************************************/

	function remove_duplicates(ast, s) {
		function _remove_duplicates(nd, filter_dict) {
			// If this sub-tree is already in the dictionary, mark it as
			// a NOP
			const t = canonicalize(nd, s);
			if (t in filter_dict) {
				nd.type = NODE_NOP;
				return nd;
			}
			filter_dict[t] = 0;

			switch (nd.type) {
				case NODE_AND:
					// If this is an "AND" node, continue using the same filter
					// dictionary
					_remove_duplicates(nd.children[0], filter_dict);
					_remove_duplicates(nd.children[1], filter_dict);
					break;
				case NODE_OR:
					// Use a fresh filter dictionary on "OR" nodes
					_remove_duplicates(nd.children[0], {});
					_remove_duplicates(nd.children[1], {});
					break;
				case NODE_NOT:
					// Use a fresh filter dictionary on "NOT" nodes
					_remove_duplicates(nd.children[0], {});
					break;
				default:
					break;
			}
			return nd;
		}

		/* Call the internval version of _remove_duplicates on the simplified
		   ast, which turns the AST into a proper binary tree. */
		ast = ast.simplify();
		return _remove_duplicates(ast, {}).simplify();
	}

	/**************************************************************************
	 * VALIDATOR                                                              *
	 **************************************************************************/

	// Constants used for keyword validation
	// TODO: Use server configuration
	const KEYWORDS_MIN_LEN = 2;
	const KEYWORDS_MAX_LEN = 30;
	const KEYWORDS_SPLIT_RE = /[\n;:().,!?/]/;

	// Constants used for date validation
	const DATE_RE = /^([0-9]+)([-/_]([0-9A-Za-z]+)([-/_]([0-9]+))?)?$/;
	const DATE_MONTHS = {
		"january": 1,
		"february": 2,
		"march": 3,
		"april": 4,
		"may": 5,
		"june": 6,
		"july": 7,
		"august": 8,
		"september": 9,
		"october": 10,
		"november": 11,
		"december": 12,
	};

	/**
	 * The validate function recursively checks whether the expression
	 * represented by an AST is valid. In particular, this limits permissible
	 * filter expressions ("user:", "author:", "tag:", "date:"), and makes sure
	 * that the values of filter expressions correspond to their limitations
	 * (i.e., valid user names, valid tags, valid dates).
	 *
	 * Furthermore, enriches the tree semantically by attaching the date range
	 * to date filter expressions and the user id to user filter expressions
	 * if the "user_list" object is given.
	 *
	 * Invalid expressions are replaced with a corresponding error node that
	 * maps onto the text represented by the underlying node.
	 *
	 * @param {ASTNode} ast the AST that should be validated.
	 * @param {String} s the original text used to generate the correct error
	 *                 nodes. Optional.
	 * @param {Object} user_list the list of users that should be associated
	 *                 with the corresponding filter expressions. Optional.
	 */
	function validate(ast, s, user_list) {
		/**
		 * Used to get the underlying text of a token; handles tokens replaced
		 * by strings.
		 */
		function _get_text(t) {
			return typeof t == "string" ? t : t.text;
		}

		/**
		 * Creates a new error node that spans the already existing node "nd".
		 */
		function _error_node(nd, msg) {
			const err =  new ASTNode(NODE_ERR);
			err.token = canonicalize(nd, s);
			err.msg = msg;
			return err;
		}
		/**
		 * Validates the "user" filter expression.
		 */
		function _validate_user(nd) {
			/* Do nothing if no user_list was specified */
			if (!user_list) {
				return nd;
			}

			/* Try to match the value to a value in the user list */
			const value = _get_text(nd.value).toLowerCase();
			let match_uid = 0;
			let match_quality = 0.0;
			function _match(s) {
				if (s.toLowerCase().indexOf(value) == -1) {
					return 0.0;
				}
				return value.length / Math.max(1, s.length);
			}
			for (let uid in user_list) {
				/* Make sure that uid is an integer */
				uid = parseInt(uid);

				/* If the uid is given (for some weird reason), we're done */
				if ((parseInt(value) == uid)) {
					match_uid = uid;
					break;
				}
				const user = user_list[uid];
				const q = Math.max(_match(user.name), _match(user.display_name));
				if (q > match_quality) {
					match_uid = uid;
					match_quality = q;
				}
			}

			/* Error out with the corresponding error messages if the user
			   could not be resolved. */
			if (!match_uid) {
				return _error_node(nd, "%err_user_not_found");
			}

			/* Otherwise store the uid in the node and replace the text with the
			   canonical user name. */
			nd.filter_type = 'user';
			nd.value = user_list[match_uid].name;
			nd.uid = match_uid;
			return nd;
		}

		/**
		 * Validates the "tag" filter expression.
		 */
		function _validate_tag(nd) {
			/* Make sure the given tag name matches the constraints on
			   keywords */
			const value = _get_text(nd.value);
			if ((value.length < KEYWORDS_MIN_LEN) ||
				(value.length > KEYWORDS_MAX_LEN) ||
				(value.match(KEYWORDS_SPLIT_RE))) {
				return _error_node(nd, "%err_invalid_keyword");
			}

			/* Set the filter type and return the keyword */
			nd.filter_type = "tag";
			return nd;
		}

		function _validate_date(nd) {
			const value = _get_text(nd.value);
			const match = value.match(DATE_RE);
			if (!match) {
				return _error_node(nd, "%err_invalid_date");
			}

			/* Canonicalise the year, month, and date */
			let yy = match[1], mm = match[3], dd = match[5];
			if ((typeof mm === "string")) {
				for (let month_name in DATE_MONTHS) {
					if (month_name.indexOf(mm) == 0) {
						mm = DATE_MONTHS[month_name];
						break;
					}
				}
			}
			if ((typeof mm === "string") && !mm.match(/^[0-9]+$/)) {
				return _error_node(nd, "%err_invalid_date");
			}

			/* Make sure we valid integers */
			const has_mm = (mm !== undefined);
			const has_dd = (dd !== undefined);
			yy = parseInt(yy);
			mm = has_mm ? parseInt(mm) : 1;
			dd = has_dd ? parseInt(dd) : 1;
			if (isNaN(yy) || isNaN(mm) || isNaN(dd)) {
				return _error_node(nd, "%err_invalid_date");
			}

			/* Make sure the year, day and month are valid */
			if (yy < 0 || mm < 1 || dd < 1 || mm > 12 || dd > 31) {
				return _error_node(nd, "%err_invalid_date");
			}

			/* If the year is smaller than 100, treat it as describing a date
			   in this century */
			if (yy < 100) {
				yy += (yy < 60) ? 2000 : 1900;
			}

			/* Try to generate the start date -- check whether it is a valid
			   date by converting it back to numbers and comparing */
			const start_date = new Date();
			start_date.setUTCFullYear(yy);
			start_date.setUTCMonth(mm - 1);
			start_date.setUTCDate(dd);
			start_date.setUTCHours(0);
			start_date.setUTCMinutes(0);
			start_date.setUTCSeconds(0);
			start_date.setUTCMilliseconds(0);

			const start_date_canon = new Date(start_date.valueOf());
			if ((start_date_canon.getUTCFullYear() != yy) ||
				(start_date_canon.getUTCMonth() != mm - 1) ||
				(start_date_canon.getUTCDate() != dd)) {
				return _error_node(nd, "%err_invalid_date");
			}

			/* Compute the end date -- either add exactly one day, month or
			   year. */
			const end_date = new Date();
			end_date.setUTCFullYear(has_mm ? yy : (yy + 1));
			end_date.setUTCMonth((has_dd || !has_mm) ? (mm - 1) : mm);
			end_date.setUTCDate(dd);
			end_date.setUTCHours(has_dd ? 24 : 0);
			end_date.setUTCMinutes(0);
			end_date.setUTCSeconds(0);
			end_date.setUTCMilliseconds(0);

			/* Attach start and end timestamps to the node */
			nd.filter_type = "date";
			nd.date_start = Math.floor(start_date.valueOf() / 1000);
			nd.date_end = Math.ceil(end_date.valueOf() / 1000) - 1;
			return nd;
		}

		/**
		 * Internal, recursive implementation of validate.
		 */
		function _validate(nd) {
			/* Validate all child nodes first */
			nd.children = nd.children.map(_validate);

			/* Nothing to do if this isn't a filter epxression */
			if (nd.type != NODE_FILTER) {
				return nd;
			}

			/* Fetch the key, this must be one of "user", "author", "tag"
			   "date"" */
			const key = _get_text(nd.key).toLowerCase();
			switch (key) {
				case "user":
				case "author":
					return _validate_user(nd);
				case "#":
				case "tag":
					return _validate_tag(nd);
				case "date":
					return _validate_date(nd);
				default:
					return _error_node(nd, "%err_invalid_filter_expression");
			}
		}
		return _validate(ast);
	}

	/**************************************************************************
	 * AUTOCOMPLETION                                                         *
	 **************************************************************************/

	/**
	 * For the given AST and cursor location within the originally parsed
	 * string, returns a list of leaf nodes that should be taken into account
	 * for autocompletion.
	 *
	 * @param {ASTNode} ast is the AST for which the autocomplete context should
	 * be computed.
	 * @param {*} cursor is the location of the cursor within the string the AST
	 * was parsed from.
	 * @returns a tuple containing a list of nodes as well as the index of the
	 * node within that list corresponding to the current cursor location.
	 */
	function autocomplete_context(ast, cursor) {
		/* Make sure the cursor location is an integer */
		cursor = parseInt(cursor);

		/* Returns the start, end range of the token with special handling in
		   case the token is a string and thus has an unkown location. */
		function _get_token_range(t) {
			return ((t === undefined) || (typeof t == "string")) ?
				null : [t.start, t.end];
		}

		/* Returns true if the given token range is valid. */
		function _is_valid_token_range(r) {
			return (r !== null) && (r[1] > r[0]);
		}

		/* Returns the token range covering the two given token ranges. */
		function _merge_token_ranges(r0, r1) {
			return (!_is_valid_token_range(r0)) ? r1 :
				((!_is_valid_token_range(r1)) ? r0 : [Math.min(r0[0], r1[0]),
				                                      Math.max(r0[1], r1[1])]);
		}

		/* Checks whether the cursor location is inside the token range */
		function _is_strictly_in_range(r) {
			return _is_valid_token_range(r) && (r[0] < cursor) && (r[1] > cursor);
		}

		/* Checks whether the range is to the left of the cursor location. */
		function _is_left(r) {
			return _is_valid_token_range(r) && (r[1] <= cursor);
		}

		/* Build a temporary copy of the AST with ranges attached to each
		   node. */
		function _build_range_tree(nd) {
			let res = {
				"range": null,
				"node": nd,
				"children": [],
				"traversible": !nd.explicit_parens,
			};
			switch (nd.type) {
				case NODE_WORD:
					res.range =  _get_token_range(nd.value);
					break;
				case NODE_FILTER:
					res.range = _merge_token_ranges(
						_get_token_range(nd.key), _get_token_range(nd.value));
					res.traversible = false;
					break;
				case NODE_ERR:
					res.range = _get_token_range(nd.token);
					res.traversible = false;
					break;
				case NODE_AND:
				case NODE_OR:
					res.children.push(_build_range_tree(nd.children[0]));
					if (nd.token) {
						res.children.push({
							"range": _get_token_range(nd.token),
							"node": null,
							"children": [],
							"traversible": false,
						});
					}
					res.children.push(_build_range_tree(nd.children[1]));
					res.range = _merge_token_ranges(
						res.children[0].range,
						res.children[res.children.length - 1].range);
					break;
				case NODE_NOT:
					res.children.push({
						"range": _get_token_range(nd.token),
						"node": null,
						"children": [],
						"traversible": false,
					});
					res.children.push(_build_range_tree(nd.children[0]));
					res.range = res.children[1].range;
					break;
				case NODE_NOP:
					res.children.push({
						"range": null,
						"node": null,
						"children": [],
						"traversible": true,
					});
			}

			/* Extend the range if this is an expression with explicit
			   parentheses */
			if (nd.explicit_parens) {
				if (nd.token_paren_open && "start" in nd.token_paren_open) {
					res.range[0] = Math.min(res.range[0],
					                        nd.token_paren_open.start);
				}
				if (nd.token_paren_close && "end" in nd.token_paren_close) {
					res.range[1] = Math.max(res.range[1],
					                        nd.token_paren_close.end);
				}
			}
			return res;
		}

		/* Flattens the range tree into a list with separators */
		function _flatten_range_tree(rnd) {
			if (rnd.children.length == 0) {
				return [rnd];
			}
			let res = [];
			for (let i = 0; i < rnd.children.length; i++) {
				const c = rnd.children[i];
				if (c.node && !c.traversible) {
					res.push({
						"range": c.range ? [c.range[0], c.range[0] + 1] : null,
						"node": null,
						"children": [],
						"traversible": false,
					});
				}
				res = res.concat(_flatten_range_tree(c));
				if (c.node && c.node.explicit_parens) {
					res.push({
						"range": c.range ? [c.range[1] - 1, c.range[1]] : null,
						"node": null,
						"children": [],
						"traversible": false,
					});
				}
			}
			return res;
		}

		/* Simplify to ensure that there are only binary/unary operations */
		ast = ast.simplify();

		/* Build the range_tree, which is a version of the AST annotated with
		   range and traversibility information, the flatten it into a list
		   of ranges with separators */
		const ranges = _flatten_range_tree(_build_range_tree(ast));

		/* In the range list, search for the index where we're either exactly
		   in a range or where we're transitioning from an element that's not
		   to the left of the cursor. */
		let i_cur = 0;
		for (let i = 0; i < ranges.length; i++) {
			if (_is_left(ranges[i].range)) {
				i_cur++;
			}
		}

		/* If the cursor is strictly left to a separator, then go one element
		   back */
		if (i_cur > 0 && i_cur < ranges.length && !ranges[i_cur].node &&
				!_is_strictly_in_range(ranges[i_cur].range)) {
			i_cur--;
		}

		/* Now collect the elements that are to the left and the right of the
		   cursor, respectively. */
		const lhs = [], rhs = [];
		for (let i = i_cur; (i >= 0) && (i == ranges.length || ranges[i].node); i--) {
			if (i < i_cur) {
				lhs.unshift(ranges[i].node);
			}
		}
		for (let i = i_cur; (i < ranges.length) && ranges[i].node; i++) {
			rhs.push(ranges[i].node);
		}

		return [lhs, rhs];
	}

	/**************************************************************************
	 * SERIALISATION                                                          *
	 **************************************************************************/

	/**
	 * Turns a parsed and validated AST into a JSON object describing the filter
	 * that can in turn be sent to the server.
	 *
	 * @param {ASTNode} ast is an AST as returned by the parse() function.
	 */
	function serialize(ast) {
		/**
		 * Used to get the underlying text of a token; handles tokens replaced
		 * by strings.
		 */
		function _get_text(t) {
			return typeof t == "string" ? t : t.text;
		}

		/**
		 * Joins child nodes with the same operator into a single operator.
		 */
		function _join(res, c1, c2) {
			if (Array.isArray(c1) && c1[0] == res[0]) {
				res = res.concat(c1.slice(1));
			} else {
				res = res.concat([c1]);
			}
			if (Array.isArray(c2) && c2[0] == res[0]) {
				res = res.concat(c2.slice(1));
			} else {
				res = res.concat([c2]);
			}
			return res;
		}

		function _serialize(nd) {
			switch (nd.type) {
				case NODE_WORD:
					return _get_text(nd.value);
				case NODE_FILTER: {
					let key = nd.filter_type || _get_text(nd.key);
					let value =  _get_text(nd.value);
					switch (key) {
						case "user":
						case "author":
							key = "user";
							value = nd.uid;
							break;
						case "date":
							value = [
								Math.floor(nd.date_start),
								Math.ceil(nd.date_end)];
							break;
						case "#":
						case "tag":
							return ["#", value];
					}
					let obj = {};
					obj[key] = value;
					return obj;
				}
				case NODE_AND:
					return _join(["&"],
						_serialize(nd.children[0]), _serialize(nd.children[1]));
				case NODE_OR:
					return _join(["|"],
						_serialize(nd.children[0]), _serialize(nd.children[1]));
				case NODE_NOT: {
					const c = _serialize(nd.children[0]);
					if (Array.isArray(c) && c[0] == "!") {
						return c.slice(1);
					}
					return ["!"].concat(c);
				}
				case NODE_NOP:
				case NODE_ERR:
					return null;
			}
		}

		return _serialize(ast);
	}


	return {
		"tokenize": tokenize,
		"parse": parse,
		"validate": validate,
		"canonicalize": canonicalize,
		"remove_duplicates": remove_duplicates,
		"autocomplete_context": autocomplete_context,
		"serialize": serialize,
	};
})(this);
