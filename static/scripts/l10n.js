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

this.tivua = this.tivua || {};
this.tivua.l10n = (function () {
	"use strict";

	// Fetch a reference at the actual data
	const l10n_data = tivua.l10n_data;

	/**
	 * Information about the current locale.
	 */
	const locale = {
		"default_locale": tivua.utils.get_cookie("locale") || "en-US",
		"current_locale": tivua.utils.get_cookie("locale") || "en-US",
		"fallback_locale": "en-US"
	};

	/**
	 * Looks up the given string in the translation database.
	 */
	function translate(str) {
		let dict = l10n_data[locale.fallback_locale];
		let fallback_dict = dict;
		if (locale.current_locale in l10n_data) {
			dict = l10n_data[locale.current_locale];
		}
		if (dict && str in dict) {
			return dict[str];
		}
		if (fallback_dict && str in fallback_dict) {
			return fallback_dict[str];
		}
		return str.toLocaleString();
	}

	/**
	 * Function used to translate a DOM tree. Attatches the
	 * "originalTextContent" to all nodes that have been translated. This allows
	 * translate_dom_tree() to translate the same DOM tree multiple times.
	 */
	function translate_dom_tree(nd, ignore_original_text = false) {
		// Translate or attribute value nodes
		if (nd.nodeType == nd.TEXT_NODE || nd.nodeType == nd.ATTRIBUTE_NODE) {
			if (nd.originalTextContent && ignore_original_text) {
				nd.originalTextContent = null;
			}
			if (nd.originalTextContent) {
				nd.textContent = translate(nd.originalTextContent);
			} else if (nd.textContent.length > 0 && nd.textContent.charAt(0) == '%') {
				nd.originalTextContent = nd.textContent;
				nd.textContent = translate(nd.textContent);
			}
		}

		// Iterate over all attributes
		if (nd.attributes) {
			for (let attribute of nd.attributes) {
				translate_dom_tree(attribute, ignore_original_text);
			}
		}

		// Iterate over all children
		if (nd.childNodes) {
			for (let child of nd.childNodes) {
				translate_dom_tree(child, ignore_original_text);
			}
		}
	}

	function set_node_text(nd, text) {
		nd.innerText = text;
		translate_dom_tree(nd, true);
	}

	/**
	 * Sets the locale to the given locale and re-translates the current
	 * document body.
	 */
	function set_locale(locale_name) {
		tivua.utils.set_cookie("locale", locale_name);
		locale.current_locale = locale_name;
		translate_dom_tree(document.getElementsByTagName("body")[0]);
	}

	/**
	 * Returns the current locale.
	 */
	function get_locale() {
		return locale.current_locale;
	}

	return {
		"data": l10n_data,
		"translate": translate,
		"translate_dom_tree": translate_dom_tree,
		"set_locale": set_locale,
		"get_locale": get_locale,
		"set_node_text": set_node_text
	};
})();