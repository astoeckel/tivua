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
 * @file scripts/utils.js
 *
 * This file implements some utility functions used throught the view module.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.utils = (function (window) {
	'use strict';

	// See https://stackoverflow.com/questions/1418050/string-strip-for-javascript
	if (typeof(String.prototype.trim) === "undefined") {
		String.prototype.trim = function() {
			return String(this).replace(/^\s+|\s+$/g, '');
		};
	}

	/**
	 * Normalises the given string into an ASCII search string.
	 */
	function to_normalised_ascii_string(str) {
		// TODO: Use proper Unicode transliteration
		const map = {
			"ä": "a",
			"ö": "o",
			"ü": "u",
			"ß": "s",
			"é": "e",
			"è": "e",
			"ì": "i",
			"í": "i",
			"ú": "u",
			"ù": "u"
		};
		return str.toLowerCase().replace(
			/[^a-z0-9]/g,
			function(x) { return map[x] || ''; }
		);
	}

	/**
	 * Deletes all child nodes of the given DOM element.
	 */
	function clear(elem) {
		while (elem.firstChild) {
			elem.removeChild(elem.firstChild);
		}
	}

	/**
	 * Removes empty text nodes from the given DOM element. This function is
	 * executed on ever DOM tree that is being instantiated.
	 *
	 * TODO: Just run this once on the root document.
	 */
	function clean_whitespace(elem) {
		function is_ignorable(nd) {
			return ((nd.nodeType == 8) ||
				((nd.nodeType == 3) && !(/[^\t\n\r ]/.test(nd.textContent))));
		}

		let cur = elem.firstChild;
		while (cur) {
			let next = cur.nextSibling;
			if (is_ignorable(cur)) {
				elem.removeChild(cur);
			} else if (cur.nodeType == 1) {
				clean_whitespace(cur);
			}
			cur = next;
		}
	}

	/**
	 * Instantiates the template with the given name. Removes any whitespace
	 * nodes from the template by passing the template instance through "clean".
	 * Translates all strings.
	 */
	function import_template(name) {
		// Instantiate the template
		let template = document.querySelector("template#" + name);
		let instance = document.importNode(template.content, true);
		clean_whitespace(instance);
		tivua.l10n.translate_dom_tree(instance);
		return instance;
	}

	/**
	 * Replaces the content of the given root node with the given element.
	 */
	function replace_content(root, elem) {
		clear(root);
		root.appendChild(elem);
	}

	function storage_available(type) {
		var storage;
		try {
			storage = window[type];
			var x = '__storage_test__';
			storage.setItem(x, x);
			storage.removeItem(x);
			return true;
		}
		catch(e) {
			return e instanceof DOMException && (
				// everything except Firefox
				e.code === 22 ||
				// Firefox
				e.code === 1014 ||
				// test name field too, because code might not be present
				// everything except Firefox
				e.name === 'QuotaExceededError' ||
				// Firefox
				e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
				// acknowledge QuotaExceededError only if there's something already stored
				(storage && storage.length !== 0);
		}
	}

	// See https://stackoverflow.com/questions/14573223/set-cookie-and-get-cookie-with-javascript
	function set_cookie(name, value, days=null) {
		if (storage_available("localStorage")) {
			window.localStorage[name] = value;
		} else {
			let expires = "";
			if (days) {
				let date = new Date();
				date.setTime(date.getTime() + (days*24*60*60*1000));
				expires = "; expires=" + date.toUTCString();
			}			
			document.cookie = name + "=" + (encodeURIComponent(value) || "")  + expires + "; path=/";
		}
	}

	function get_cookie(name) {
		if (storage_available("localStorage")) {
			return window.localStorage.getItem(name);
		} else {
			let nameEQ = name + "=";
			let ca = document.cookie.split(';');
			for (let i=0; i < ca.length; i++) {
				let c = ca[i];
				while (c.charAt(0)==' ') {
					c = c.substring(1,c.length);
				}
				if (c.indexOf(nameEQ) == 0) {
						return decodeURIComponent(c.substring(nameEQ.length, c.length));
				}
			}
			return null;
		}
	}

	function format_date(timestamp, sep) {
		sep = (sep === undefined) ? '/' : sep;
		const date = (timestamp instanceof Date) ? timestamp : new Date(timestamp * 1000);
		return ("0000" + date.getUTCFullYear()).slice(-4)
		       + sep + ("00" + (1 + date.getUTCMonth())).slice(-2)
		       + sep + ("00" + ( date.getUTCDate())).slice(-2);
	}

	function format_local_date(timestamp, sep) {
		sep = (sep === undefined) ? '/' : sep;
		const date = (timestamp instanceof Date) ? timestamp : new Date(timestamp * 1000);
		return ("0000" + date.getFullYear()).slice(-4)
		       + sep + ("00" + (1 + date.getMonth())).slice(-2)
		       + sep + ("00" + ( date.getDate())).slice(-2);
	}

	/**
	 * Converts the given local timestamp to a UTC timestamp pointing at noon of
	 * the same day.
	 */
	function local_time_as_utc_date(timestamp) {
		const time = (timestamp instanceof Date) ? timestamp : new Date(timestamp * 1000);
		const date = new Date();
		date.setUTCFullYear(time.getFullYear());
		date.setUTCMonth(time.getMonth());
		date.setUTCDate(time.getDate());
		date.setUTCHours(12);
		date.setUTCMinutes(0);
		date.setUTCSeconds(0);
		date.setUTCMilliseconds(0);
		return Math.trunc(date.valueOf() / 1000);
	}

	/**
	 * Converts a string of the form "YYYY-MM-DD" to a Date() object pointing at
	 * noon, UTC of the given date.
	 *
	 * @param s is the string that should be converted.
	 * @param sep is the separator, defaults to "-".
	 */
	function string_to_utc_date(s, sep) {
		/* Split the given string into the individual parts */
		sep = (sep === undefined) ? '-' : sep;
		const is_int = (x) => (x | 0) === x;
		const parts = s.split(sep);
		if (parts.length != 3) {
			return null;
		}

		/* Try to convert the individual parts to integers and make sure they
		   make sense */
		const year = parseInt(parts[0]);
		const month = parseInt(parts[1]);
		const day = parseInt(parts[2]);
		if (!is_int(year) || !is_int(day) || !is_int(day)) {
			return null;
		}
		if (month <= 0 || month > 12 || year < 0 || day < 0 || day > 31) {
			return null;
		}

		/* Create a new Date object with the corresponding date */
		const date = new Date();
		date.setUTCFullYear(year);
		date.setUTCMonth(month - 1);
		date.setUTCDate(day);
		date.setUTCHours(12);
		date.setUTCMinutes(0);
		date.setUTCSeconds(0);
		date.setUTCMilliseconds(0);

		/* Make sure the date roundtrips correctly. This filters stuff such as
		   invalid days (i.e. 30th of April). */
		if (format_date(date, '-') != s) {
			return null;
		}
		return date;
	}

	function get_now_as_utc_date() {
		const date_in_this_timezone = new Date();
		const date_as_utc = new Date();
		date_as_utc.setUTCFullYear(date_in_this_timezone.getFullYear());
		date_as_utc.setUTCMonth(date_in_this_timezone.getMonth());
		date_as_utc.setUTCDate(date_in_this_timezone.getDate());
		date_as_utc.setUTCHours(12);
		date_as_utc.setUTCMinutes(0);
		date_as_utc.setUTCSeconds(0);
		date_as_utc.setUTCMilliseconds(0);

		return date_as_utc;
	}

	function execute_action(action) {
		/* Allow use of "bind" for event handlers */
		if (action === undefined) {
			action = this;
		}

		/* Transform the strings into an action object */
		if (typeof action === "string") {
			action = {
				"uri": action
			};
		}

		if (typeof action === "function") {
			action = {
				"callback": action
			};
		}

		if (("uri" in action) && action["uri"]) {
			if (action["uri"].charAt(0) == '#') {
				tivua.main.switch_to_fragment(action.uri);
			} else if (action["uri"] == "/") {
				const loc = window.location.toString();
				const hi = loc.indexOf("#")
				window.location = loc.substr(0, hi >= 0 ? hi : loc.length);
			} else {
				window.location = action["uri"];
			}
		} else if (("callback" in action) && action["callback"]) {
			action["callback"]();
		}
	}

	function exec(action) {
		return () => execute_action(action);
	}

	function binary_search(A, x, pred) {
		let lower = 0;
		let upper = A.length - 1;
		while (lower <= upper) {
			const k = lower + ((upper - lower) >> 1);
			const res = pred(x, A[k]);
			if (res > 0) {
				lower = k + 1;
			} else if (res < 0) {
				upper = k - 1;
			} else {
				return k;
			}
		}
		return -1;
	}

	function remove_event_listeners(node) {
		const clone = node.cloneNode(true);
		node.parentNode.replaceChild(clone, node);
		return clone;
	}

	/**
	 * Highlights the given word in the DOM tree. Inserts the "<mark>" tag
	 * arround all text fragments that match one in the list of terms.
	 *
	 * @param {HTMLElement} node the DOM subtree in which the given term should
	 * be highlighted.
	 * @param {Array} terms is a list of terms that should be highlighted
	 * @param {bool} whole_word if true, highlights the complete word for which
	 * a prefix is matching.
	 */
	function highlight(node, terms, whole_word) {
		/* Internally used recursive function actually performing the
		   highlighting */
		function _highlight(node, re_link, re_text) {
			if (node.nodeType == document.ELEMENT_NODE) {
				/* Descend into element nodes and highlight all their
				   children */
				let child = node.firstChild;
				while (child) {
					child = _highlight(child, re_link, re_text).nextSibling;
				}
				for (let attr of node.attributes) {
					if (attr.name != 'href') {
						continue;
					}
					if (attr.value.match(re_link)){
						let mark = document.createElement("mark");
						node.parentNode.insertBefore(mark, node);
						mark.appendChild(node);
						return mark;
					}
				}
				return node;
			} else if (node.nodeType == document.TEXT_NODE) {
				/* This is a text node. Fetch the parent node and the actual
				   text content */
				const parent = node.parentNode;
				let text = node.textContent;

				/* last_child will point at the last child node we inserted into
				   the parent node */
				let last_child = null;

				/* Try to match the regular expression to the text as often as
				   possible, splitting the text into a prefix, overlap, and
				   suffix */
				while (text) {
					let match = text.match(re_text);
					if (!match) {
						/* No further matches, insert the rest of the text */
						last_child = document.createTextNode(text);
						parent.insertBefore(last_child, node);
						break;
					}
					/* There has been a match, get the overlap, prefix and
					   suffix */
					let overlap = whole_word ? match[2] : match[1];
					let offs = text.indexOf(match[0]) + match[0].indexOf(overlap);
					let prefix = text.substring(0, offs);
					let suffix = text.substring(offs + overlap.length);

					/* Create the highlighted element */
					let mark = document.createElement("mark");
					mark.innerText = overlap;

					/* Insert the prefix and the highlighted text */
					parent.insertBefore(document.createTextNode(prefix), node);
					parent.insertBefore(mark, node);

					/* Continue the loop with the suffix and remember the last
					   child we inserted into the tree */
					text = suffix;
					last_child = mark;
				}
				if (last_child) {
					parent.removeChild(node);
					return last_child;
				}
				return node;
			}
			return node;
		}

		/* Filter empty terms */
		terms = terms.filter(x => !!(x.trim()));
		if (!terms.length) {
			return node;
		}

		/* For each term, escape regular expression special characters */
		terms = terms.map(x => x.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));

		/* If "whole_word" is true, match any non-white space cahracters behind
		   a match */
		let re_link = null, re_text = null;
		re_link = re_text = new RegExp("(" + terms.join('|') + ")", "i");
		if (whole_word) {
			terms = terms.map(x => x + "[^ ,.:!?'\"/_()-]*");
			re_text = new RegExp("(^|[ ():-])(" + terms.join('|') + ")", "i");
		} 

		/* Create the actual regular expression and recursivly highlight the
		   text */
		return _highlight(node, re_link, re_text);
	}

	return {
		'clear': clear,
		'clean_whitespace': clean_whitespace,
		'import_template': import_template,
		'replace_content': replace_content,
		'get_cookie': get_cookie,
		'set_cookie': set_cookie,
		'to_normalised_ascii_string': to_normalised_ascii_string,
		'format_date': format_date,
		'format_local_date': format_local_date,
		'local_time_as_utc_date': local_time_as_utc_date,
		'string_to_utc_date': string_to_utc_date,
		'get_now_as_utc_date': get_now_as_utc_date,
		'execute_action': execute_action,
		'exec': exec,
		'binary_search': binary_search,
		'remove_event_listeners': remove_event_listeners,
		'highlight': highlight,
	};
})(this);
