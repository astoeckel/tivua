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
 * @file searchbox.js
 *
 * Implements the search box with autocompletion used in the card view.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.components = this.tivua.view.components || {};
this.tivua.view.components.searchbox = (function() {
	"use strict";

	/* Module aliases */
	const colors = tivua.colors;
	const time = tivua.time;
	const utils = tivua.utils;

	function _autocomplete_source(api, term, response, cursor) {
		term = term.toLowerCase().trim();
		const matches = (x) => (x.toLowerCase().includes(term));

		// Fetch all keywords and all users
		const promises = [
			api.get_user_list(),
			api.get_keyword_list(),
		];
		Promise.all(promises).then((data) => {
			// Fetch the keywords and users arrays
			const users = data[0].users;
			const keywords = data[1].keywords;
			const res = [];

			// Filter for users
			for (let uid in users) {
				const user = users[uid];
				let weight = 0.0;
				if (matches(user.display_name)) {
					weight = term.length / user.display_name.length;
				}
				if (matches(user.name)) {
					weight = Math.max(term.length / user.name.length);
				}
				if (weight > 0.0) {
					res.push(["user", user, 100.0 * weight]);
				}
			}

			// Filter for tags
			// TODO: merge with editor code somehow
			for (let keyword in keywords) {
				const count = keywords[keyword];
				if (matches(keyword)) {
					const weight = count * Math.sqrt(term.length / keyword.length);
					res.push(["keyword", keyword, weight]);
				}
			}

			// Respond with the strings
			response(res.sort((a, b) => b[2] - a[2]));
		});
	}

	function _autocomplete_render_item(item, search) {
		// escape special characters
		let text = "", value = "";
		switch (item[0]) {
			case "user":
				const user = item[1];
				text = (user.display_name + " (" + user.name + ")").trim();
				value = "user:" + user.name;
				break;
			case "keyword":
				text = item[1];
				if (text.includes(" ")) {
					value = "tag:\\\"" + text + "\\\"";
				} else {
					value = "tag:" + text;
				}
				break;
		}

		search = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		var re = new RegExp("(" + search.split(' ').join('|') + ")", "gi");
		return '<div class="autocomplete-suggestion" data-val="' + value + '">' + text.replace(re, "<b>$1</b>") + '</div>';
	}

	function _init_autocomplete(api, root, input, anchor) {
		const autocomplete = new autoComplete({
			"minChars": 2,
			"delay": 50,
			"selector": input,
			"anchor": anchor,
			"menuClass": "search",
			"source": _autocomplete_source.bind(null, api),
			"renderItem": _autocomplete_render_item,
			"offsetTop": -7,
			"root": root
		});
	}

	/* Creates the annotation layer, highlighting the individual parts of the
	   expression. This uses the "canonicalize" function, that transduces the
	   syntax tree into a canaonicalized, user-defined tree. */
	function _create_annotations(ast, s) {
		const transform = (expr, nd) => {
			const type = nd ? nd.describe() : null;
			if (type) {
				const span = document.createElement("span");
				span.setAttribute("class", `leaf ${type}`);
				if (type == "filter") {
					span.textContent = " " + expr + " ";
				} else {
					span.textContent = expr;
				}
				return span;
			}
			return document.createTextNode(expr);
		};

		const join = (sep, elems) => {
			const span = document.createElement("span");
			for (let i = 0; i < elems.length; i++) {
				if (i > 0 && sep) {
					span.appendChild(document.createTextNode(sep));
				}
				span.appendChild(elems[i]);
			}
			return span;
		}

		return tivua.filter.canonicalize(ast, s, transform, join);
	}


	function _show_searchbox(api, root, autocomplete_root, events, value) {
		const l10n = tivua.l10n;

		/* Instantiate the template and fetch the individual components */
		const tmpl = utils.import_template('tmpl_searchbox');
		const div_searchbox = tmpl.querySelector(".searchbox");
		const div_annotations = tmpl.querySelector(".annotations");
		const inp_search = tmpl.querySelector("[name=inp_search]");
		const btn_clear = tmpl.querySelector("[name=btn_clear]");

		/* Attach the autocomplete to the search bar */
		_init_autocomplete(api, autocomplete_root, inp_search, div_searchbox);

		/* Hide the annotation layer whenever the input field is focused */
		inp_search.addEventListener('focus', () => {
			div_annotations.style.display = "none";
			if (inp_search.value) {
				inp_search.classList.remove("hidden");
			}
		});

		/* Rebuild the filter expression whenever there is a change */
		inp_search.addEventListener('change', () => {
			/* Parse the filter expression into an AST */
			const s = inp_search.value;
			const ast = tivua.filter.parse(s);

			/* Update the annotation layer and the input text */
			const annotations = _create_annotations(ast, s);
			inp_search.value = annotations.innerText || "";

			/* If there is an error, mark the error box as possessing an error
			   and set the title to the error message. */
			const err = ast.get_first_error();
			div_searchbox.classList.toggle("error", !!err);
			inp_search.setAttribute("title", err ? l10n.translate(err.msg) : "");

			/* Update the annotation layer */
			utils.replace_content(div_annotations, annotations);
		});

		/* Show the annotation layer and create the annotations whenever the
		   input field is defocused */
		inp_search.addEventListener('blur', () => {
			/* Scroll the input field back to the beginning, clear any
			   selection */
			inp_search.scrollLeft = 0; /* FF only */
			inp_search.selectionStart = 0;
			inp_search.selectionEnd = 0;

			/* Display the annotations again (this has been updated by the
			   change event). */
			if (inp_search.value) {
				inp_search.classList.add("hidden");
			}
			div_annotations.style.display = "flex";
		});

		/* Insert the template into the root container */
		utils.replace_content(root, tmpl);
	}

	function create_searchbox(api, root, autocomplete_root, value) {
		const events = {
			"on_search": () => { throw "Not implemented"; },
			"on_clear": () => { throw "Not implemented"; },
		};
		return new Promise((resolve, _) => {
			_show_searchbox(api, root, autocomplete_root, events, value);
			resolve(events);
		});
	}

	return {
		'create': create_searchbox,
	};
})();