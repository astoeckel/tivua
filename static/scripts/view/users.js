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

	const ROLE_SORT_ORDER = {
		"admin": 0,
		"author": 1,
		"reader": 2,
		"inactive": 3
	};

	// Module aliases
	const utils = tivua.utils;
	const colors = tivua.colors;
	const view = tivua.view;

	function show_user_manager(api, root, events, users, session) {
		const l10n = tivua.l10n;

		function _copy_to_clipboard(event) {
			/* Fetch the span containing the text we want to copy as well as the
			   button that was clicked */
			const td = event.target.closest('td');
			const span = td.querySelector('span');
			const btn = event.target.closest('button');

			/* Try to copy the span text to the clipboard, give some feedback */
			utils.copy_to_clipboard(span.innerText)
				.then((ok) => {
					for (let btn of document.querySelectorAll("button.clipboard")) {
						btn.classList.toggle('success', false);
						btn.classList.toggle('error', false);
					}
					btn.classList.toggle('success', ok);
					btn.classList.toggle('error', !ok);
				});
		}

		function _reset_password(event) {
			/* Fetch the tr this node belongs to */
			const tr = event.target.closest('tr');
			const td = event.target.closest('td');
			const uid = parseInt(tr.getAttribute('data-uid'));
			const user = users[uid];

			const title = l10n.translate("Confirm password reset");
			const msg = l10n.translate("Are you sure you want to reset the password for user \"{name}\" ({id})?\n\nThis user will no longer be able to log into Tivua until you send them the newly generated password, which will be displayed once you confirm this message.\n\nNote: This action will not end a user's active sessions. Set their role to \"Inactive\" to prevent them from accessing Tivua.")
				.replace("{name}", user.display_name)
				.replace("{id}", user.name);
			const dialogue = [null];
			dialogue[0] = view.utils.show_dialogue(
				root,
				title,
				msg, [{
					"type": "button",
					"icon": "confirm",
					"caption": "Yes, reset password",
					"callback": () => {
						const div_overlay = view.utils.show_loading_overlay(root);
						api.reset_password(uid).then((data) => {
							/* Display the user's newly generated password and
							   show a 'copy to clipboard' button */
							const tmpl = utils.import_template('tmpl_user_manager_view_password_reset');
							const lbl_password = tmpl.querySelector('span');
							const btn_clipboard = tmpl.querySelector('button.clipboard');
							const btn_email = tmpl.querySelector('button.email');
							lbl_password.innerText = data.password;
							btn_clipboard.addEventListener('click', _copy_to_clipboard);
							btn_email.addEventListener('click', () => {
								const url = window.location.toString().split("#")[0];
								const subject = l10n.translate('New password for the Tivua instance at {url}')
									.replace("{url}", url);
								const body = l10n.translate('Hi {name},\n\nyour Tivua password has been reset. Find a new temporary password below. You will be prompted to set a new password the first time you log in; please do so as soon as possible.\n\nURL:      {url}\nLogin:    {user}\nPassword: {password}\n\nLet me know in case you have any questions!\n\nBest,\n{current_user}\n')
									.replace("{name}", user.display_name.split(" ")[0])
									.replace("{url}", url)
									.replace("{user}", user.name)
									.replace("{password}", data.password)
									.replace("{current_user}", session.display_name.split(" ")[0]);
								location.href = "mailto:" + '?&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
							});

							/* Show the buttons */
							utils.replace_content(td, tmpl);

							/* Close the overlay */
							div_overlay.close();
							dialogue[0].close();
						});
					},
				}, {
					"type": "button",
					"icon": "cancel",
					"role": "cancel",
					"caption": "Cancel",
					"callback": () => { dialogue[0].close(); },
				}]);
		}

		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_user_manager_view');
		const tbody = main.querySelector('tbody');

		/* Setup the back button */
		tivua.view.utils.setup_back_button(main.getElementById("btn_back"));

		/* Sort the users by role and then by name */
		let user_list = Object.values(users).sort((a, b) => {
			if (a.role != b.role) {
				return ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role];
			}
			return a.display_name.localeCompare(b.display_name);
			//return colors.author_id_to_hue(a.uid) - colors.author_id_to_hue(b.uid);
		});

		/* Insert an editable row for each user */
		let current_role = null;
		for (let user of user_list) {
			/* Ignore the deleted user */
			if (user.uid == 0) {
				continue;
			}

			/* Insert headers for each role */
			if (current_role !== user.role) {
				current_role = user.role;
				const tmpl = utils.import_template('tmpl_user_manager_view_sep');
				const lbl_caption = tmpl.querySelector('[name=lbl_caption]');
				l10n.set_node_text(lbl_caption, "%header_users_role_" + user.role);
				tbody.appendChild(tmpl);
			}

			/* Fetch the individual row elements */
			const tmpl = utils.import_template('tmpl_user_manager_view_row');
			const tr = tmpl.querySelector('tr');
			const span_colorcircle = tr.querySelector('.colorcircle');
			const lbl_name = tr.querySelector('[name=lbl_name]');
			const lbl_display_name = tr.querySelector('[name=lbl_display_name]');
			const sel_role = tr.querySelector('[name=sel_role] option');
			const sel_auth_method = tr.querySelector('[name=sel_auth_method] option');
			const btn_clipboard = tr.querySelector('button.clipboard');
			const btn_reset_password = tr.querySelector('button.reset');

			/* Update the row data */
			span_colorcircle.style.backgroundColor = colors.author_id_to_color(user.uid);
			lbl_name.innerText = user.name;
			lbl_display_name.innerText = user.display_name;
			l10n.set_node_text(sel_role, "%lbl_users_role_" + user.role);
			l10n.set_node_text(sel_auth_method, "%lbl_users_auth_method_" + user.auth_method);

			/* Hookup events */
			btn_reset_password.addEventListener('click', _reset_password);
			btn_clipboard.addEventListener('click', _copy_to_clipboard);

			console.log(tr, user.name, user.uid);
			tr.setAttribute('data-uid', user.uid);
			tbody.appendChild(tmpl);
		}

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);
	}

	function create_user_manager(api, root, id) {
		const promises = [
			api.get_user_list(),
			api.get_session_data(),
		];
		return Promise.all(promises).then((data) => {
			const users = data[0].users;
			const session = data[1].session;
			const events = {};
			show_user_manager(api, root, events, users, session);
			return events;
		});
	}

	return {
		'create': create_user_manager
	};
})();
