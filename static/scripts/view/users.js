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
 * @file users.js
 *
 * Implementation of the user manager
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.user_manager = (function() {
	"use strict";

	// Module aliases
	const utils = tivua.utils;

	function show_user_manager(root, events) {
		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_user_manager_view');

		/* Setup the back button */
		tivua.view.utils.setup_back_button(main.getElementById("btn_back"));

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);
	}

	function create_user_manager(api, root, id) {
		return new Promise((resolve, reject) => {
			const events = {};
			show_user_manager(root, events);
			resolve(events);
		});
	}

	return {
		'create': create_user_manager
	};
})();
