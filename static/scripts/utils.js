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

	// See https://stackoverflow.com/questions/14573223/set-cookie-and-get-cookie-with-javascript
	function set_cookie(name, value, days=null) {
		let expires = "";
		if (days) {
			let date = new Date();
			date.setTime(date.getTime() + (days*24*60*60*1000));
			expires = "; expires=" + date.toUTCString();
		}
		document.cookie = name + "=" + (encodeURIComponent(value) || "")  + expires + "; path=/";
	}

	function get_cookie(name) {
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

	return {
		'clear': clear,
		'clean_whitespace': clean_whitespace,
		'import_template': import_template,
		'replace_content': replace_content,
		'get_cookie': get_cookie,
		'set_cookie': set_cookie
	};
})(this);
