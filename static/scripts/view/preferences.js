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
 * @file preferences.js
 *
 * Implementation of the user preferences.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.preferences = (function() {
	"use strict";

	// Module aliases
	const utils = tivua.utils;

	function show_preferences(root, events, session, force_change_password) {
		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_preferences');

		/* Setup the back button */
		tivua.view.utils.setup_back_button(main.getElementById("btn_back"));

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);
	}

	function create_preferences(api, root, force_change_password) {
		/* Make sure force_change_password is a bool */
		force_change_password = !!force_change_password;

		return new Promise((resolve, reject) => {
			const events = {
				/* Triggered whenever the preferences are supposed to be
				   closed. */
				"on_back": () => window.history.back(),
			};
			api.get_session_data().then((data) => {
				const session = data.session;
				show_preferences(root, events, session, force_change_password);
			});
			resolve(events);
		});
	}

	return {
		'create': create_preferences
	};
})();
