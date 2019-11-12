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

/* Partially adapted from https://github.com/sparksuite/codemirror-spell-checker/issues/28 */

this.tivua = this.tivua || {};
this.tivua.spellcheck = (function() {
	"use strict";

	const spellcheck_dir = "extern/dict/";
	const spellcheck_lang = "en_CA";
	const spellcheck_data = {
		"aff": null,
		"dic": null
	}
	const spellcheck_sep = "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~ \t";

	function init() {
		function create_typo_promise() {
			return new Promise((resolve, reject) => {
				resolve(new Typo("en_US",
					spellcheck_data.aff,
					spellcheck_data.dic,
					{platform: "any"}
				));
			});
		}
		if (!spellcheck_data.aff && !spellcheck_data.dic) {
			return Promise.all([
				fetch(spellcheck_dir + spellcheck_lang + ".aff")
					.then(response => response.text()),
				fetch(spellcheck_dir + spellcheck_lang + ".dic")
					.then(response => response.text())
			]).then((data) => {
				spellcheck_data.aff = data[0];
				spellcheck_data.dic = data[1];
				return create_typo_promise();
			});
		}
		return create_typo_promise();
	}

	function start(cm, typo) {
		if (!cm || !typo) return;

		cm.addOverlay({
			token: function(stream) {
				let ch = stream.peek();
				let word = "";

				if (spellcheck_sep.includes(ch)) {
					stream.next();
					return null;
				}

				while ((ch = stream.peek()) && !spellcheck_sep.includes(ch)) {
					word += ch;
					stream.next();
				}

				if (!typo.check(word)) {
					return "spell-error";
				}
			}
		});
	}

	return {
		"init": init,
		"start": start
	}
})();
