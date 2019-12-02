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
 * @file help.js
 *
 * Implementation of the help page.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.help = (function() {
	"use strict";

	// Module aliases
	const utils = tivua.utils;
	const view = tivua.view;


	function show_help(root) {
		/* Instantiate the hip view DOM nodes */
		const main = utils.import_template('tmpl_help');

		const sec_markdown = main.querySelector('section[name="help_markdown_section"]');
		const sec_search = main.querySelector('section[name="help_search_section"]');
		

		/* Setup the back button */
		const btn_back = main.getElementById("btn_back");
		tivua.view.utils.setup_back_button(btn_back);

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);

	}

	function create_help(api, root, id) {
		return new Promise((resolve, reject) => {
			show_help(root);
			resolve();
		});
	}


	return {
		'create': create_help
	};
})();
