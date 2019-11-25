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
	const utils = tivua.utils;

	/**
	 * The _autocomplete_source function is called whenever the underlying
	 * autocomplete component requests autocompletion data.
	 */
	function _autocomplete_source(api, text, response, cursor) {
		const filter = tivua.filter;

		/* Fetch all keywords and users */
		const promises = [
			api.get_user_list(),
			api.get_keyword_list(),
		];

		/* Parse the term into an AST and query the autocomplete context */
		const ast = filter.parse(text).simplify();
		const [lhs, rhs] = filter.autocomplete_context(ast, cursor);
		const anchor = Math.max(Math.min(rhs.length + lhs.length - 1, lhs.length - 1));
		const nodes = lhs.concat(rhs);

		function _autocompletions_for_context(users, tags, res, i0, i1) {
			/* Restrict the search to either users or tags if we're currently in
			   a corresponding filter expression */
			let search_tags = true, search_users = true;
			if (nodes[i0] && nodes[i0].key) {
				const key = nodes[i0].key.text.toLowerCase();
				search_tags = key == "tag" || key == "#";
				search_users = key == "user" || key == "author";
			}

			/* Create a list of search strings and join those into a single
			   string. */
			function _get_text(nd) {
				if (nd.value && nd.value.text) {
					return nd.value.text.toLowerCase();
				}
				return "";
			}
			const slice = nodes.slice(i0, i1 + 1);
			const term = slice.map(_get_text).join(" ").trim();
			const matches = (x) => (x.toLowerCase().includes(term));
			if (!term) {
				return;
			}

			/* Filter for users; skip the "[deleted]" user */
			if (search_users) {
				for (let uid in users) {
					if (parseInt(uid) <= 0) {
							continue;
					}
					const user = users[uid];
					let weight = 0.0;
					if (matches(user.display_name)) {
						weight = 100.0 * term.length / user.display_name.length;
					}
					if (matches(user.name)) {
						weight = 100.0 * Math.max(term.length / user.name.length);
					}
					if (weight > 0.0) {
						const key = "user:" + uid;
						if (!(key in res) || res[key].weight < weight) {
							const node = filter
								.parse("user:" + user.name)
								.detach_from_string();
							const replacement = ast
								.replace(slice, node)
								.canonicalize(text);
							res[key] = {
								"type": "user",
								"user": user,
								"weight": weight,
								"term": term,
								"replacement": replacement,
							};
						}
					}
				}
			}

			/* Filter for tags */
			if (search_tags) {
				for (let tag in tags) {
					const count = tags[tag];
					if (matches(tag)) {
						const weight = count * Math.sqrt(term.length / tag.length);
						const key = "tag:" + tag;
						if (!(key in res) || res[key].weight < weight) {
							const node = filter
								.parse("#'" + tag.replace("'", "\\'") + "'")
								.detach_from_string();
							const replacement = ast
								.replace(slice, node)
								.canonicalize(text);
							res[key] = {
								"type": "tag",
								"tag": tag,
								"weight": weight,
								"term": term,
								"replacement": replacement,
							};
						}
					}
				}
			}
		}

		/* Fetch the user and keyword lists */
		Promise.all(promises).then((data) => {
			const users = data[0].users;
			const keywords = data[1].keywords;

			/* Go over all ranges that include the anchor node in the
			   autocomplete context and request autocompletions for this range */
			let res = {};
			for (let i0 = 0; i0 <= anchor; i0++) {
				for (let i1 = anchor; i1 < nodes.length; i1++) {
					if (i1 - i0 <= 3 ) {
						_autocompletions_for_context(users, keywords, res, i0, i1);
					}
				}
			}

			/* Turn the entries into a sorted list of recommendations */
			response(Object.values(res).sort((a, b) => b.weight - a.weight));
		});
	}

	/**
	 * Renders a single autocomplete item.
	 */
	function _autocomplete_render_item(item) {
		/* Create the result div */
		let div_suggestion = document.createElement("div");
		div_suggestion.setAttribute("class", "autocomplete-suggestion");
		div_suggestion.setAttribute("data-val", item.replacement);

		/* Add a small emblem characterising the substitution that is being
		   performed when applying the filter */
		let span_icon = document.createElement("span");
		span_icon.classList.add("icon");
		span_icon.classList.add(item.type);
		div_suggestion.appendChild(span_icon);

		/* Prepare the text that should be displayed, depending on the type */
		let text = "";
		switch (item.type) {
			case "user":
				const user = item.user;
				const color = colors.author_id_to_color(user.uid, true);
				span_icon.style.backgroundColor = color;
				text = (user.display_name + " (" + user.name + ")").trim();
				break;
			case "tag":
				text = item.tag;
				break;
		}

		/* Create a regular expression for highlighting the matches */
		div_suggestion.appendChild(document.createTextNode(text));
		utils.highlight(div_suggestion, item.term.split(" "));

		return div_suggestion;
	}

	/**
	 * Helper function used to create the "autoComplete" instance performing
	 * the actual autocompletion.
	 */
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
			"root": root,
			"fixedPos": true,
		});
	}

	/**
	 * Creates the annotation layer, highlighting the individual parts of the
	 * expression. This uses the "ASTNode.canonicalize" function, which
	 * transduces the syntax tree into a canonicalised, user-defined tree.
	 */
	function _create_annotations(ast, s) {
		const transform = (expr, nd) => {
			const type = nd ? nd.describe() : null;
			if (type) {
				const span = document.createElement("span");
				span.setAttribute("class", `leaf ${type}`);
				if (type == "filter") {
					if (nd.filter_type == "user") {
						const color = colors.author_id_to_color(nd.uid, true);
						span.style.backgroundColor = color;
					/*	span.style.borderColor = color;*/
					}
					span.classList.add(nd.filter_type);
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
		};

		return ast.canonicalize(s, transform, join);
	}

	/**
	 * Creates a new searchbox within the given root element.
	 */
	function _show_searchbox(api, root, autocomplete_root, users) {
		const l10n = tivua.l10n;

		/* Instantiate the template and fetch the individual components */
		const tmpl = utils.import_template('tmpl_searchbox');
		const div_searchbox = tmpl.querySelector(".searchbox");
		const div_annotations = tmpl.querySelector(".annotations");
		const inp_search = tmpl.querySelector("[name=inp_search]");
		const btn_clear = tmpl.querySelector("[name=btn_clear]");

		/* If the "clear" button is hit, reset the search */
		btn_clear.addEventListener("click", () => {
			/* Reset the value in the input box and hide the annotations */
			inp_search.value = "";
			_rebuild_annotations();
			_update_annotation_visibility(false);

			/* Trigger a search event */
			div_searchbox.on_search("");
		});

		/* Attach the autocomplete to the search bar */
		_init_autocomplete(api, autocomplete_root, inp_search, div_searchbox);

		/* Rebuilds the annotations in the background of the searchbox */
		function _rebuild_annotations() {
			/* Parse the filter expression into an AST */
			const s = inp_search.value;
			const ast = tivua.filter.parse(s).validate(s, users);

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

			/* Return true if there was no error */
			return !err;
		}

		/* Toggles the annotation and input box visibility */
		function _update_annotation_visibility(visible) {
			if (visible && inp_search.value) {
				inp_search.classList.add("hidden");
				div_annotations.style.display = "flex";
			} else {
				div_annotations.style.display = "none";
				inp_search.classList.remove("hidden");
			}
		}

		/* Hide the annotation layer whenever the input field is focused */
		inp_search.addEventListener('focus', () => {
			_update_annotation_visibility(false);
		});

		/* Rebuild the filter expression whenever there is a change */
		inp_search.addEventListener('change', () => {
			/* Make sure the annotations are in sync with the updated search
			   box. */
			const ok = _rebuild_annotations();

			/* If there is no error, trigger the "on_search" event */
			if (ok && div_searchbox.on_search) {
				div_searchbox.on_search(div_searchbox.get_filter());
			}
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
			_update_annotation_visibility(true);
		});

		/* Add some properties to the search box */
		div_searchbox.on_search = () => { throw "Not implemented"; }
		div_searchbox.set_filter = (filter) => {
			/* Update the search box value */
			inp_search.value = filter;

			/* Rebuild the annotations and display them (if the input box
			   doesn't have the focus)*/
			_rebuild_annotations();
			_update_annotation_visibility(document.activeElement != inp_search);
		};
		div_searchbox.get_filter = (filter) => {
			const s = inp_search.value;
			return tivua.filter.parse(s).canonicalize(s);
		};

		/* Insert the template into the root container */
		utils.replace_content(root, tmpl);
		return div_searchbox;
	}

	function create_searchbox(api, root, autocomplete_root, users) {
		return _show_searchbox(api, root, autocomplete_root, users);
	}

	return {
		'create': create_searchbox,
	};
})();
