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

	function _compute_password_score(pass) {
		/* Based on https://stackoverflow.com/a/11268104 */
		let score = 0;

		/* Award every unique letter until 5 repetitions */
		let counts = {};
		for (let i = 0; i < pass.length; i++) {
			counts[pass[i]] = (counts[pass[i]] || 0) + 1;
			score += 5.0 / counts[pass[i]];
		}

		/* Bonus points for using different character classes */
		let classes = {
			digits: /\d/.test(pass),
			lower: /[a-z]/.test(pass),
			upper: /[A-Z]/.test(pass),
			nonWords: /\W/.test(pass),
		};
		let classCount = Object.values(classes).reduce((a, b) => a + b);
		score += Math.max((classCount - 1) * 10, 0);
		const max_score = 80;
		return (Math.max(0, Math.min(max_score, score)) / max_score * 100) | 0;
	}

	function _score_password(inp_password, prg_strength, lbl_strength) {
		const l10n = tivua.l10n;

		/* Fetch the password and compute the numerical score */
		const passw = inp_password.value;
		const score = Math.max(0, Math.min(_compute_password_score(passw)));
		prg_strength.value = score;

		/* If the password is too short, display a corresponding warning */
		if (passw.length == 0) {
			l10n.set_node_text(lbl_strength, "No password entered");
			lbl_strength.setAttribute('class', 'strength');
		} else if (passw.length < 8) {
			l10n.set_node_text(lbl_strength, "Too short");
			lbl_strength.setAttribute('class', 'strength weak');
		} else if (score > 90) {
			l10n.set_node_text(lbl_strength, "Strong");
			lbl_strength.setAttribute('class', 'strength strong');
		} else if (score > 60) {
			l10n.set_node_text(lbl_strength, "Good");
			lbl_strength.setAttribute('class', 'strength good');
		} else {
			l10n.set_node_text(lbl_strength, "Weak");
			lbl_strength.setAttribute('class', 'strength weak');
		}
		prg_strength.setAttribute('class', lbl_strength.getAttribute('class'));
	}

	function _update_error_state(main, field_name, valid) {
		for (let btn of main.querySelectorAll("button[name='btn_save']")) {
			_update_error_state(btn, field_name, valid);
		}
	}

	function _validate_password(main, field_name, inp_password, lbl_error) {
		const l10n = tivua.l10n;
		const passw = inp_password.value;
		const valid = (passw.length >= 8) && /^\S+$/.test(passw);
		if (!valid && passw.length > 0) {
			l10n.set_node_text(lbl_error, 'Shorter than 8 characters or has whitespace');
		} else {
			l10n.set_node_text(lbl_error, '');
		}
		inp_password.classList.toggle('error', !valid && (passw.length > 0));
		inp_password.classList.toggle('ok', valid && (passw.length > 0));
		_update_error_state(main, field_name, valid);
	}

	function _validate_display_name(main, field_name, inp_display_name, lbl_error) {
		const l10n = tivua.l10n;
		const valid = (inp_display_name.value.length > 0) && (inp_display_name.value.length <= 32);
		if (!valid) {
			l10n.set_node_text(lbl_error, 'Display name cannot be blank');
		} else {
			l10n.set_node_text(lbl_error, '');
		}
		inp_display_name.classList.toggle('error', !valid);
		inp_display_name.classList.toggle('ok', valid);
		_update_error_state(main, field_name, valid);
		return valid;
	}

	function _validate_update_password(main, field_name, inp_password, inp_password_new, inp_password_new_repeat, lbl_error) {
		const l10n = tivua.l10n;
		/* Check that the new password is valid */
		const passw_valid = (inp_password_new.value.length >= 8) && /^\S+$/.test(inp_password_new.value);
		if (!passw_valid) {
			l10n.set_node_text(lbl_error, 'Shorter than 8 characters or has whitespace');
			return false;
		}

		/* Check that the new and repeated password are the same */
		if (inp_password_new.value !== inp_password_new_repeat.value) {
			l10n.set_node_text(lbl_error, 'New password does not match repeated password');
			return false;
		}

		l10n.set_node_text(lbl_error, '');
		return true;
	}

	function show_preferences(api, root, events, session, force_change_password) {
		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_preferences');
		const sec_force_change_password = main.querySelector('section[name="sec_force_change_password"]');
		const sec_user_details = main.querySelector('section[name="sec_user_details"]');
		const sec_password = main.querySelector('section[name="sec_password"]');

		const inp_user_name = main.getElementById('inp_user_name');
		const inp_display_name = main.getElementById('inp_display_name');
		const lbl_display_name_error = main.querySelector("label[for='inp_display_name'] span.error");
		inp_user_name.value = session["user_name"];
		inp_display_name.value = session["display_name"];

		/* Implement the show/hide password buttons, as well as password
		   validation */
		for (let div_row_password of main.querySelectorAll('div.row.password')) {
			const btn = div_row_password.querySelector('button');
			const input = div_row_password.querySelector('input');
			btn.addEventListener('click', () => {
				/* Read the current state from the input */
				const currently_hidden = input.type == 'password';

				/* Toggle between hiding and revealing the password by flipping
				   the state */
				const hidden = !currently_hidden;

				/* Toggle the button icon */
				btn.classList.toggle('hidden', hidden);
				btn.classList.toggle('revealed', !hidden);

				/* Toggle the input type to actually reveal/hide the password */
				input.type = hidden ? 'password' : 'text';
				input.classList.toggle('revealed', !hidden);
			});
		}

		/* Implement the password meter */
		const inp_password_new = main.getElementById("password_new");
		const prg_password_strength = main.getElementById("prg_password_strength");
		const lbl_password_strength = main.getElementById("lbl_password_strength");
		const lbl_password_new_error = main.querySelector("label[for='password_new'] span.error");
		const lbl_password_error = main.querySelector("label[for='password'] span.error");
		inp_password_new.addEventListener('keyup', () =>
			_score_password(inp_password_new, prg_password_strength, lbl_password_strength));
		inp_password_new.addEventListener('change', () =>
			_score_password(inp_password_new, prg_password_strength, lbl_password_strength));

		/* Implement form validation */
		inp_password_new.addEventListener('change', () => {
			_validate_password(main, 'password_new', inp_password_new, lbl_password_new_error);
/*			_validate_confirm_password(main, 'password_confirm', inp_password_, lbl_password_new_error)*/
		});


		/* Setup the back button */
		const btn_back = main.getElementById("btn_back");
		if (!force_change_password) {
			tivua.view.utils.setup_back_button(btn_back);
		} else {
			btn_back.setAttribute('disabled', 'disabled');
		}

		/* Hide/show certain sections depending on the mode */
		if (force_change_password) {
			sec_user_details.style.display = 'none';
		} else {
			sec_force_change_password.style.display = 'none';
		}

		// const btn_save = main.getElementById("btn_save");
		// There are two save buttons on this page
		const btn_save_list = main.querySelectorAll("[name=btn_save]");

		const inp_password = main.getElementById("password");
		const inp_password_new_repeat = main.getElementById("password_new_repeat");

		let validate_display_name = () => _validate_display_name(main, 'display_name', inp_display_name, lbl_display_name_error);
		let validate_password = () => _validate_update_password(main, 'password_new', inp_password, inp_password_new, inp_password_new_repeat, lbl_password_new_error);

		inp_display_name.addEventListener('change', () => {
			validate_display_name();
		});

		for (let btn_save of btn_save_list) {
			btn_save.addEventListener("click", function () {

				let api_call_display_name = null;
				let api_call_password = null;

				/* Check if display_name has been changed */
				if (inp_display_name.value != session.display_name) {
					if (!validate_display_name()) {
						return;  /* Errors for validation are shown live, don't need to do anything here */
					}
					let settings = {};
					settings['display_name'] = inp_display_name.value;
					api_call_display_name = api.post_user(settings);
				}

				/* If anything is typed into a password field, assume the user wants to update their password */
				if ((inp_password.value.length > 0) || (inp_password_new.value.length > 0) || (inp_password_new_repeat.value.length > 0)) {
					if (!validate_password()) {
						return;  /* Errors for validation are shown live, don't need to do anything here */
					}
					api_call_password = api.set_password(session.user_name, inp_password.value, inp_password_new.value);
				}

				Promise.all([api_call_display_name, api_call_password]).then((data) => {
					// TODO: currently a refresh is needed to see the updated display name on the main page
					events.on_back();
				}).catch((error) => {
					// TODO: display a correct message depending on the error (should only be a password error)
					// TODO: make sure the session doesn't get lost when the password fails
					l10n.set_node_text(lbl_error, 'Password is incorrect');
				});
				return;
			});
		}

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
				show_preferences(api, root, events, session, force_change_password);
			});
			resolve(events);
		});
	}

	return {
		'create': create_preferences
	};
})();
