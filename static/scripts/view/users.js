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
	const l10n = tivua.l10n;

	/**
	 * Copies the content of the span next to the clicked button into the
	 * clipboard.
	 */
	function _copy_to_clipboard(event) {
		// Fetch the span containing the text we want to copy as well as the
		// button that was clicked.
		const td = event.target.closest('td');
		const span = td.querySelector('span[name]');
		const input = td.querySelector('input[name]');
		const btn = event.target.closest('button');

		// Fetch the text that should be copied from either the next input field
		// or the next span
		const text = (span ? span.innerText : (input ? input.value : ""));

		// Try to copy the span text to the clipboard, give some feedback
		utils.copy_to_clipboard(text)
			.then((ok) => {
				for (let btn of document.querySelectorAll("button.clipboard")) {
					btn.classList.toggle('success', false);
					btn.classList.toggle('error', false);
				}
				btn.classList.toggle('success', ok);
				btn.classList.toggle('error', !ok);

				for (let elem of document.querySelectorAll('.copied_to_clipboard')) {
					elem.classList.toggle('copied_to_clipboard', false);
				}
				(span || input).classList.toggle('copied_to_clipboard', true);
			});
	}

	/**
	 * Function handling a click on the "reset password" button.
	 */
	function _reset_password(event, api, root, users, session) {
		// Fetch the tr this node belongs to
		const tr = event.target.closest('tr');
		const td = event.target.closest('td');
		const uid = parseInt(tr.getAttribute('data-uid'));
		const user = users[uid];

		// Show a dialogue asking for confirmation
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
						// Display the user's newly generated password and
						// show a 'copy to clipboard' button
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

						// Show the buttons
						utils.replace_content(td, tmpl);
					}).finally(() => {
						// Close the overlay
						div_overlay.close();
						dialogue[0].close();
					}).catch((e) => {
						view.show_error_dialogue(_reset_passwordroot, e);
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

	/**
	 * Deletes a user from Tivua.
	 */
	function _delete_user(event, api, root, users, session, config, force) {
		// Default "force" to false
		force = (force === undefined) ? false : !!force;

		// Fetch the tr this node belongs to
		const tr = event.target.closest('tr');
		const uid = parseInt(tr.getAttribute('data-uid'));
		const user = users[uid];

		// Show a dialogue asking for confirmation
		let title = "";
		let msg = "";
		if (force) {
			title = l10n.translate("⚠ This user contributed content");
			msg = l10n.translate("The user \"{name}\" ({id}) contributed content, which will be owned by the special \"[deleted]\" user after the deletion.\n\nAre you REALLY sure you want to delete this user?\n\nThis action cannot be undone. Consider marking the user as \"Inactive\" instead.")
				.replace("{name}", user.display_name)
				.replace("{id}", user.name);
		} else {
			title = l10n.translate("⚠ Confirm user deletion");
			msg = l10n.translate("Are you sure you want to delete the user \"{name}\" ({id})?\n\nThis action cannot be undone. Consider marking the user as \"Inactive\" instead.")
				.replace("{name}", user.display_name)
				.replace("{id}", user.name);
		}
		const dialogue = [null];
		dialogue[0] = view.utils.show_dialogue(
			root,
			title,
			msg, [
			{
				"type": "button",
				"icon": "delete",
				"caption": "Yes, delete user",
				"callback": () => {
					const div_overlay = view.utils.show_loading_overlay(root);
					api.delete_user(uid, force).then((data) => {
						// Deletion may require the "force" flag to be set. In
						// this case just open this dialogue again with "force"
						// set to true.
						if (data.force_required) {
							_delete_user(event, api, root, users, session, config, true);
						} else if (data.confirmed) {
							// The user has been deleted. Just rebuild the user
							// manager.
							show_user_manager(api, root, users, session, config);
						}
					}).finally(() => {
						// Close the overlay
						div_overlay.close();
						dialogue[0].close();
					}).catch((e) => {
						view.utils.show_error_dialogue(root, e);
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

	function _save_user(event, api, root, users, session, config) {
		// Fetch the tr this node belongs to
		const tr = event.target.closest('tr');
		const uid = parseInt(tr.getAttribute('data-uid'));

		// Set the UID in case we're updating a user
		let user = {};
		if (uid in users) {
			user.uid = uid;
		}

		// Update the user properties
		const inp_display_name = tr.querySelector('input[name=inp_display_name]');
		const inp_name = tr.querySelector('input[name=inp_name]');
		const sel_role = tr.querySelector('select[name=sel_role]');
		const sel_auth_method = tr.querySelector('select[name=sel_auth_method]');
		user.display_name = inp_display_name.value.trim();
		user.name = inp_name.value.trim();
		user.role = sel_role.value;
		user.auth_method = sel_auth_method.value;

		// Either create or update the user
		let promise = null;
		if ("uid" in user) {
			promise = tivua.api.update_user(user);
		} else {
			promise = tivua.api.create_user(user);
		}

		// Remove any old error markers
		inp_display_name.classList.remove("error");
		inp_name.classList.remove("error");
		sel_role.classList.remove("error");

		// Wait for the server response and handle potential errors
		const div_overlay = view.utils.show_loading_overlay(root);
		promise.then((data) => {
			// The update was successful, store the updated user in the
			// "users" map.
			let user = data.user;
			users[user.uid] = user;

			// Rebuild the user manager
			show_user_manager(api, root, users, session, config, user.uid);
		}).catch((e) => {
			// There was an error. Highlight the problem
			// TODO
			if (e.what == "%server_error_no_name") {
				inp_display_name.focus();
				inp_display_name.classList.add("error");
				inp_name.classList.add("error");
			} else if (e.what == "%server_error_invalid_display_name") {
				inp_display_name.focus();
				inp_display_name.classList.add("error");
			} else if (e.what == "%server_error_invalid_name" || e.what == "%server_error_conflict") {
				inp_name.focus();
				inp_name.classList.add("error");
			} else if (e.what == "%server_error_invalid_role") {
				sel_role.focus();
				sel_role.classList.add("error");
			} else {
				view.utils.show_error_dialogue(root, e);
			}
		}).finally(() => {
			div_overlay.close();
		});
	}

	function _focus_edit_row(tr) {
		const inp_display_name = tr.querySelector('input[name=inp_display_name]');
		if (inp_display_name) {
			inp_display_name.focus();
			inp_display_name.scrollIntoView({
				"block": "center",
				"behavior": "smooth",
			});
		}
	}

	function _toggle_edit_row(api, root, users, session, config, tr, edit) {
		const uid = tr.getAttribute('data-uid');
		if (uid in users) {
			const row = _create_user_row(api, root, users, session, config, users[uid], edit);
			const new_tr = row.querySelector('tr');
			tr.parentNode.replaceChild(row, tr);
			if (edit) {
				_focus_edit_row(new_tr);
			}
		}
		return tr;
	}

	/**
	 * Toggles all rows that are currently being edited back to their normal
	 * state. Removes the UI elements used for adding a new user.
	 */
	function _reset_edit_rows(api, root, users, session, config, tbody, tr) {
		// Remove any row that's being used for editing a user
		for (let new_user_row of tbody.querySelectorAll('tr[data-uid=\'-1\']')) {
			utils.remove(new_user_row);
		}

		// Remove any "new user" header
		for (let new_user_header of tbody.querySelectorAll('tr.separator.new_user')) {
			utils.remove(new_user_header);
		}

		// Transition all rows that are currently being edited to the normal
		// mode
		for (let other_tr of tbody.querySelectorAll('tr[data-edit]')) {
			if (!tr || tr != other_tr) {
				_toggle_edit_row(api, root, users, session, config, other_tr, false);
			}
		}
	}

	/**
	 * Function creating a DOM node representing a row in the user table.
	 */
	function _create_user_row(api, root, users, session, config, user, edit) {
		// If no user is given, this means that we're editing a new user. Create
		// a dummy user object.
		if (!user) {
			user = {
				'uid': -1,
				'auth_method': 'password',
				'role': 'author',
				'name': '',
				'display_name': '',
			};
		}

		// Fetch the "edit" flag
		edit = (edit === undefined) ? false : !!edit;

		// Fetch the individual row elements
		const tmpl = utils.import_template('tmpl_user_manager_view_row');
		const tr = tmpl.querySelector('tr');

		// Mark this row as belonging to the current user
		tr.setAttribute('data-uid', user.uid);
		if (edit) {
			tr.setAttribute('data-edit', '');
		}

		// Update the row data
		const span_colorcircle = tr.querySelector('.colorcircle');
		const lbl_name = tr.querySelector('[name=lbl_name]');
		const inp_name = tr.querySelector('[name=inp_name]');
		const lbl_display_name = tr.querySelector('[name=lbl_display_name]');
		const inp_display_name = tr.querySelector('[name=inp_display_name]');
		const sel_role = tr.querySelector('[name=sel_role]');
		const sel_auth_method = tr.querySelector('[name=sel_auth_method]');
		span_colorcircle.style.backgroundColor = colors.author_id_to_color(user.uid);
		lbl_name.innerText = inp_name.value = user.name;
		lbl_display_name.innerText = inp_display_name.value = user.display_name;
		sel_role.value = user.role;
		sel_auth_method.value = user.auth_method;

		// Remove unavailable authentification methods
		function remove_login_method(method) {
			// Fetch the option for the given value and remove the entire
			// optgroup
			utils.remove(sel_auth_method.querySelector(`option[value=${method}]`).parentNode);
		}
		if (!config.login_methods.username_password) {
			remove_login_method('password');
		}
		if (!config.login_methods.cas) {
			remove_login_method('cas');
		}

		// Hook up events
		const reset_edit_rows = (event) => {
			_reset_edit_rows(api, root, users, session, config, event.target.closest('tbody'));
		};
		if (edit) {
			tr.addEventListener('keyup', (event) => {
				if (event.keyCode == 27) {
					reset_edit_rows(event);
				} else if (event.keyCode == 13) {
					_save_user(event, api, root, users, session, config);
				}
			});
		}

		const btn_clipboard = tr.querySelector('button.clipboard');
		const btn_reset_password = tr.querySelector('button.reset');
		const btn_delete = tr.querySelector('button.delete');
		const btn_edit = tr.querySelector('button.edit');
		const btn_cancel = tr.querySelector('button.cancel');
		const btn_save = tr.querySelector('button.save');

		btn_reset_password.addEventListener('click', (event) => {
			_reset_password(event, api, root, users, session);
		});
		btn_clipboard.addEventListener('click', (event) => {
			_copy_to_clipboard(event);
		});
		btn_delete.addEventListener('click', (event) => {
			_delete_user(event, api, root, users, session, config);
		});
		btn_edit.addEventListener('click', (event) => {
			_reset_edit_rows(api, root, users, session, config, event.target.closest('tbody'), tr);
			_toggle_edit_row(api, root, users, session, config, tr, true);
		});
		btn_cancel.addEventListener('click', reset_edit_rows);
		btn_save.addEventListener('click', (event) => {
			_save_user(event, api, root, users, session, config);
		});

		// The current user should not be able to delete themselves
		if (session.uid == user.uid) {
			btn_delete.style.visibility = "hidden";
		}

		// Depending on whether we're editing this user or not, hide the
		// corresponding elements
		if (edit) {
			utils.remove(btn_reset_password);
			utils.remove(btn_clipboard);
			utils.remove(btn_delete);
			utils.remove(btn_edit);
			utils.remove(lbl_name);
			utils.remove(lbl_display_name);
		} else {
			if (user.auth_method != 'password') {
				utils.remove(btn_reset_password);
			}
			utils.remove(btn_cancel);
			utils.remove(btn_save);
			utils.remove(inp_name);
			utils.remove(inp_display_name);

			sel_role.setAttribute('disabled', 'disabled');
			sel_auth_method.setAttribute('disabled', 'disabled');
		}

		return tmpl;
	}

	function _create_user_header(label) {
		const tmpl = utils.import_template('tmpl_user_manager_view_sep');
		const lbl_caption = tmpl.querySelector('[name=lbl_caption]');
		l10n.set_node_text(lbl_caption, label);
		return tmpl;
	}

	function show_user_manager(api, root, users, session, config, success_uid) {
		// Instantiate the editor view DOM nodes
		const main = utils.import_template('tmpl_user_manager_view');
		const tbody = main.querySelector('tbody');

		// Setup the back button
		tivua.view.utils.setup_back_button(main.getElementById("btn_back"));

		// Setup the "add user" button
		const btn_add = main.getElementById("btn_add");
		btn_add.addEventListener('click', () => {
			_reset_edit_rows(api, root, users, session, config, tbody);

			const header = _create_user_header("%header_users_new_user");
			const tr = header.querySelector('tr');
			tr.classList.add('new_user');
			tbody.appendChild(header);
			tbody.appendChild(_create_user_row(api, root, users, session, config, null, true));
			_focus_edit_row(tbody.lastChild);
		});

		// Sort the users by role and then by name
		let user_list = Object.values(users).sort((a, b) => {
			if (a.role != b.role) {
				return ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role];
			}
			return a.display_name.localeCompare(b.display_name);
			//return colors.author_id_to_hue(a.uid) - colors.author_id_to_hue(b.uid);
		});

		// Insert an editable row for each user
		let current_role = null;
		for (let user of user_list) {
			// Ignore the special deleted user
			if (user.uid == 0) {
				continue;
			}

			// Insert headers for each role
			if (current_role !== user.role) {
				current_role = user.role;
				tbody.appendChild(_create_user_header("%header_users_role_" + user.role));
			}

			// Append the row to the table
			tbody.appendChild(_create_user_row(api, root, users, session, config, user));
		}

		// Delete the current content of the root element and replace it with
		// the body element.
		utils.replace_content(root, main);

		// If "success_uid" is set, scroll the corresponding row into view and
		// show a visual success indicator.
		if (success_uid) {
			const tr = tbody.querySelector(`[data-uid='${success_uid}']`);
			if (tr) {
				tr.scrollIntoView({
						"block": "center",
				});
				tr.classList.add('success');
				let lbl_success = document.createElement('span');
				lbl_success.classList.add('success');
				lbl_success.classList.add('icon');
				tr.querySelector("td.display_name").appendChild(lbl_success);
			}
		}
	}

	function create_user_manager(api, root, id) {
		const promises = [
			api.get_user_list(),
			api.get_session_data(),
			api.get_configuration(),
		];
		return Promise.all(promises).then((data) => {
			const users = data[0].users;
			const session = data[1].session;
			const config = data[2].configuration;
			show_user_manager(api, root, users, session, config);
			return {};
		});
	}

	return {
		'create': create_user_manager
	};
})();
