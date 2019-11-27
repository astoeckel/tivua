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
 * @file scripts/render.js
 *
 * This file renders markdown + latex content into a post.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.render = (function (window) {
	'use strict';

	/**************************************************************************
	 * Code adapted from                                                      *
	 * https://www.quaxio.com/html_white_listed_sanitizer/HTML Sanitizer      *
	 **************************************************************************/

	class HtmlWhitelistedSanitizer {

		constructor() {
			const urls = ['http://', 'https://'];

			const url_sanitizer = (attr) => {
				if (attr.startsWith('https://') || attr.startsWith('http://')) {
					return attr;
				}
				return null;
			};

			const math_sanitizer = (attr) => {
				return (attr == "math") ? attr : null;
			};

			this.doc = document.implementation.createHTMLDocument();

			this.allowedTags = {
				'a': {
					"href": url_sanitizer
				},
				'p': null,
				'span': null,
				'br': null,
				'b': null,
				'em': null,
				'strong': null,
				's': null,
				'i': null,
				'u': null,
				'ul': null,
				'ol': null,
				'dl': null,
				'li': null,
				'h1': null,
				'h2': null,
				'h3': null,
				'code': {
					'class': math_sanitizer,
				},
				'pre': {
					'class': math_sanitizer,
				},
			};
		}

		sanitizeNode(node, top_level=false) {
			const node_name = node.nodeName.toLowerCase();
			const node_type = node.nodeType;
			if (node_type == document.TEXT_NODE) {
				return node;
			}
			if (node_type == document.COMMENT_NODE) {
				return null;
			}
			let copy;
			const is_invalid = (!top_level && !(node_name in this.allowedTags));
			if (is_invalid) {
				copy = document.createDocumentFragment();
				const bad_tag = document.createElement('span');
				bad_tag.innerText = '<'+node_name+'>';
				bad_tag.classList.add('error');
				copy.appendChild(bad_tag);
			} else {
				// create a new node
				copy = this.doc.createElement(node_name);
			}
			// copy the whitelist of attributes using the per-attribute sanitizer
			const allowed_tags = this.allowedTags[node_name] || {};
			for (let attr of node.attributes) {
				if (allowed_tags && (attr.name in allowed_tags)) {
					const result = allowed_tags[attr.name](attr.value);
					if (result !== null) {
						copy.setAttribute(attr.name, result);
					}
				}
			}

			// recursively sanitize child nodes
			while (node.childNodes.length > 0) {
				const child = node.removeChild(node.childNodes[0]);
				const child_copy = this.sanitizeNode(child);
				if (child_copy) {
					copy.appendChild(child_copy);
				}
			}
			if (is_invalid) {
				const bad_tag = document.createElement('span');
				bad_tag.innerText = '</'+node_name+'>';
				bad_tag.classList.add('error');
				copy.appendChild(bad_tag);				
			}
			return copy;
		}

		sanitize(input) {
			const div = this.doc.createElement("div");
			div.innerHTML = input;
			return this.sanitizeNode(div, true);
		}
	}

	/**************************************************************************
	 * Code adapted from https://github.com/waylonflinn/markdown-it-katex     *
	 **************************************************************************/

	// Test if potential opening or closing delimieter
	// Assumes that there is a "$" at state.src[pos]
	function _is_valid_delim(state, pos) {
		var prevChar, nextChar,
		    max = state.posMax,
		    can_open = true,
		    can_close = true;

		prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
		nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

		// Check non-whitespace conditions for opening and closing, and
		// check that closing delimeter isn't followed by a number
		if (prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */ ||
		        (nextChar >= 0x30/* "0" */ && nextChar <= 0x39/* "9" */)) {
		    can_close = false;
		}
		if (nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */) {
		    can_open = false;
		}

		return {
		    can_open: can_open,
		    can_close: can_close
		};
	}

	function _math_inline(state, silent) {
		var start, match, token, res, pos, esc_count;

		if (state.src[state.pos] !== "$") { return false; }

		res = _is_valid_delim(state, state.pos);
		if (!res.can_open) {
		    if (!silent) { state.pending += "$"; }
		    state.pos += 1;
		    return true;
		}

		// First check for and bypass all properly escaped delimieters
		// This loop will assume that the first leading backtick can not
		// be the first character in state.src, which is known since
		// we have found an opening delimieter already.
		start = state.pos + 1;
		match = start;
		while ( (match = state.src.indexOf("$", match)) !== -1) {
		    // Found potential $, look for escapes, pos will point to
		    // first non escape when complete
		    pos = match - 1;
		    while (state.src[pos] === "\\") { pos -= 1; }

		    // Even number of escapes, potential closing delimiter found
		    if ( ((match - pos) % 2) == 1 ) { break; }
		    match += 1;
		}

		// No closing delimter found.  Consume $ and continue.
		if (match === -1) {
		    if (!silent) { state.pending += "$"; }
		    state.pos = start;
		    return true;
		}

		// Check if we have empty content, ie: $$.  Do not parse.
		if (match - start === 0) {
		    if (!silent) { state.pending += "$$"; }
		    state.pos = start + 1;
		    return true;
		}

		// Check for valid closing delimiter
		res = _is_valid_delim(state, match);
		if (!res.can_close) {
		    if (!silent) { state.pending += "$"; }
		    state.pos = start;
		    return true;
		}

		if (!silent) {
		    token         = state.push('math_inline', 'math', 0);
		    token.markup  = "$";
		    token.content = state.src.slice(start, match);
		}

		state.pos = match + 1;
		return true;
	}

	function _math_block(state, start, end, silent){
		var firstLine, lastLine, next, lastPos, found = false, token,
		    pos = state.bMarks[start] + state.tShift[start],
		    max = state.eMarks[start];

		if(pos + 2 > max){ return false; }
		if(state.src.slice(pos,pos+2)!=='$$'){ return false; }

		pos += 2;
		firstLine = state.src.slice(pos,max);

		if(silent){ return true; }
		if(firstLine.trim().slice(-2)==='$$'){
		    // Single line expression
		    firstLine = firstLine.trim().slice(0, -2);
		    found = true;
		}

		for(next = start; !found; ){

		    next++;

		    if(next >= end){ break; }

		    pos = state.bMarks[next]+state.tShift[next];
		    max = state.eMarks[next];

		    if(pos < max && state.tShift[next] < state.blkIndent){
		        // non-empty line with negative indent should stop the list:
		        break;
		    }

		    if(state.src.slice(pos,max).trim().slice(-2)==='$$'){
		        lastPos = state.src.slice(0,max).lastIndexOf('$$');
		        lastLine = state.src.slice(pos,lastPos);
		        found = true;
		    }

		}

		state.line = next + 1;

		token = state.push('math_block', 'math', 0);
		token.block = true;
		token.content = ((firstLine && firstLine.trim() ? firstLine + '\n' : '')
		    + state.getLines(start + 1, next, state.tShift[start], true)
		    + (lastLine && lastLine.trim() ? lastLine : ''));
		token.map = [ start, state.line ];
		token.markup = '$$';
		return true;
	}

	function _escape_html(s) {
		// https://stackoverflow.com/a/6234804
		return s
		     .replace(/&/g, "&amp;")
		     .replace(/</g, "&lt;")
		     .replace(/>/g, "&gt;")
		     .replace(/"/g, "&quot;")
		     .replace(/'/g, "&#039;");
	}

	/**************************************************************************
	 * Setup and public functions                                             *
	 **************************************************************************/

	const markdown = markdownit({
		'html': true,
		'linkify': true,
		'typographer': true,
	});

	markdown.inline.ruler.after('escape', 'math_inline', _math_inline);
	markdown.block.ruler.after('blockquote', 'math_block', _math_block, {
		alt: [ 'paragraph', 'reference', 'blockquote', 'list' ]
	});
	markdown.renderer.rules.math_inline = (tokens, idx) => {
		return "<code class=\"math\">" + _escape_html(tokens[idx].content) + "</code>";
	};
	markdown.renderer.rules.math_block = (tokens, idx) => {
		return "<pre class=\"math\">" + _escape_html(tokens[idx].content) + "</pre>";
	};

	const sanitizer = new HtmlWhitelistedSanitizer();

	function render(content) {
		// Convert the markdown to an HTML string
		const rendered_html = markdown.render(content);

		// Create the corresponding DOM tree, sanitize the HTML
		const rendered_dom = sanitizer.sanitize(rendered_html);

		// Render math
		for (let nd_math of rendered_dom.querySelectorAll("code.math, pre.math")) {
			// Render the math nodes into a document fragment
			const frag = document.createDocumentFragment();
			katex.render(nd_math.innerText, frag, {
				"throwOnError": false,
				"displayMode": nd_math.nodeName.toLowerCase() == "pre",
			});

			// Replace the original node with the content of the document
			// fragment
			for (let nd_child of frag.childNodes) {
				nd_math.parentNode.insertBefore(nd_child, nd_math);
			}
			nd_math.parentNode.removeChild(nd_math);
		}

		return rendered_dom;
	}

	return render;
})(this);
