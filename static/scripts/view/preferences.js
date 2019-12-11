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
 * @author Brent Komer
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.preferences = (function () {
	"use strict";

	// Module aliases
	const view = tivua.view;
	const utils = tivua.utils;
	const l10n = tivua.l10n;

	/**
	 * Assigns a score between 0 and 100 to a password, based on
	 * https://stackoverflow.com/a/11268104
	 */
	function _compute_password_score(pass) {
		let score = 0;

		// Award every unique letter until 5 repetitions
		let counts = {};
		for (let i = 0; i < pass.length; i++) {
			counts[pass[i]] = (counts[pass[i]] || 0) + 1;
			score += 5.0 / counts[pass[i]];
		}

		// Bonus points for using different character classes
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

	/**
	 * Updates the password score when the user is typing into the "new
	 * password" input box.
	 */
	function _score_password(inp_password, prg_strength, lbl_strength) {
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

	/**
	 * Disables the confirmation buttons as long as there is a validation error.
	 */
	function _update_error_state(main, field_name, valid) {
		for (let btn of main.querySelectorAll("button[name=btn_save]")) {
			view.utils.update_error_state(btn, field_name, valid);
		}
		return valid;
	}

	/**
	 * Validates the specified display name
	 */
	function _validate_display_name(main, field_name, inp_display_name, lbl_error) {
		const name = inp_display_name.value;
		const valid = (name.length > 0) && (name.length <= 32);
		if (!valid && name.length == 0) {
			l10n.set_node_text(lbl_error, 'Display name cannot be blank');
		} else if (!valid) {
			l10n.set_node_text(lbl_error, 'Display name too long');
		} else {
			l10n.set_node_text(lbl_error, '');
		}
		inp_display_name.classList.toggle('error', !valid);
		inp_display_name.classList.toggle('ok', valid);
		return _update_error_state(main, field_name, valid);
	}

	/**
	 * Validates all password input fields.
	 */
	function _validate_password(main, field_name,
		inp_password, inp_password_new, inp_password_new_repeat,
		lbl_password_error, lbl_password_new_error,
		lbl_password_new_repeat_error, is_required, is_final) {
		// Used internally to validat a single password
		function _validate_single(inp_password, lbl_error) {
			// Determine whether the password is valid
			const passw = inp_password.value;
			const valid = ((passw.length >= 8) && /^\S+$/.test(passw)) ||
				(passw.length == 0);

			// Display an error message informing the user about what is wrong with
			// the password;
			if (!valid && passw.length > 0) {
				l10n.set_node_text(lbl_error, 'Shorter than 8 characters or has whitespace');
				if (is_final) {
					inp_password.focus();
				}
			} else {
				l10n.set_node_text(lbl_error, '');
			}

			// Update the visual status of the corresponding input box, do not
			// display an error if no password has been entered.
			inp_password.classList.toggle('error', !valid && (passw.length > 0));
			inp_password.classList.toggle('ok', valid && (passw.length > 0));
			return valid;
		}

		function _mark_error(inp_password, lbl_error, msg, focus) {
			l10n.set_node_text(lbl_error, msg);
			if (focus || focus === undefined) {
				inp_password.focus();
			}
			inp_password.classList.toggle('error', true);
			inp_password.classList.toggle('ok', false);
			return _update_error_state(main, field_name, false);
		}

		// Fetch all three passwords to simplify some checks
		const passw = inp_password.value;
		const passw_new = inp_password_new.value;
		const passw_new_repeat = inp_password_new_repeat.value;

		// Make sure is_required is a bool
		is_required = !!is_required;
		is_final = is_final === true;

		// Generically check each of the password fields for validity
		let valid = _validate_single(inp_password, lbl_password_error) &
			_validate_single(inp_password_new, lbl_password_new_error) &
			_validate_single(inp_password_new_repeat, lbl_password_new_repeat_error);

		// Do not show the checkmark on the current password input field
		inp_password.classList.toggle('ok', false);

		// Abort if this is the final check and there are errors at this stage.
		// This will leave the focus in the password field with the error.
		if (!valid && is_final) {
			return false;
		}

		// If a password change is required and the current password is empty,
		// show a corresponding error message
		if (passw.length == 0 && is_required) {
			_mark_error(inp_password, lbl_password_error,
				'This field is required', false);
			if (is_final) {
				inp_password.focus();
				return false;
			}
		}

		// If a new password has been entered, it must not be equal to the
		// current password
		if (passw_new.length > 0 && passw.length > 0 && (
			passw_new.indexOf(passw) >= 0 || passw.indexOf(passw_new) >= 0)) {
			valid = false;
			if (passw === passw_new) {
				l10n.set_node_text(lbl_password_new_error, 'Password must be new');
			} else {
				l10n.set_node_text(lbl_password_new_error, 'Password must be significantly different');
			}
			inp_password_new.classList.toggle('error', true);
			inp_password_new.classList.toggle('ok', false);
		}

		// If the password has been repeated it must be equal to the new
		// password
		if (passw_new_repeat.length > 0 && passw_new !== passw_new_repeat) {
			return _mark_error(
				inp_password_new_repeat,
				lbl_password_new_repeat_error,
				'Passwords do not match');
		}

		// If this is the final check before submitting the form, make sure the
		// passwords are non-empty
		if (is_final && (passw.length > 0 || passw_new.length > 0 || passw_new_repeat.length > 0)) {
			if (passw.length == 0) {
				return _mark_error(
					inp_password,
					lbl_password_error,
					'Enter your current password');
			}
			if (passw_new.length == 0) {
				return _mark_error(
					inp_password_new,
					lbl_password_new_error,
					'Enter a new password');
			}
			if (passw_new_repeat.length == 0) {
				return _mark_error(
					inp_password_new_repeat,
					lbl_password_new_repeat_error,
					'Repeat the new password');
			}
		}

		// Disable the confirm button in case there is an error
		return _update_error_state(main, field_name, valid);
	}

	/**
	 * Fills the "toggle show password" with life.
	 *
	 * @param div is the div containing both a password input box and a button
	 *        for toggling between password entry and showing the password in
	 *        plain text.
	 */
	function _init_toggle_show_password_button(div) {
		const btn = div.querySelector('button');
		const input = div.querySelector('input');
		btn.addEventListener('click', (e) => {
			// Do not submit the form these buttons are contained in
			e.preventDefault();

			// Read the current state from the input
			const currently_hidden = input.type == 'password';

			// Toggle between hiding and revealing the password by flipping
			// the state
			const hidden = !currently_hidden;

			// Toggle the button icon
			btn.classList.toggle('hidden', hidden);
			btn.classList.toggle('revealed', !hidden);

			// Toggle the input type to actually reveal/hide the password
			input.type = hidden ? 'password' : 'text';
			input.classList.toggle('revealed', !hidden);
		});
	}

	function show_preferences(api, root, events, session) {
		// Instantiate the editor view DOM nodes
		const main = utils.import_template('tmpl_preferences');
		const sec_force_change_password = main.querySelector('section[name="sec_force_change_password"]');
		const sec_user_details = main.querySelector('section[name="sec_user_details"]');

		// Set the current user name and display name
		const inp_user_name = main.getElementById('inp_user_name');
		const inp_user_name_hidden = main.getElementById('inp_user_name_hidden');
		const inp_display_name = main.getElementById('inp_display_name');
		const lbl_display_name_error = main.querySelector("label[for='inp_display_name'] span.error");
		inp_user_name.value = session.name;
		inp_user_name_hidden.value = session.name;
		inp_display_name.value = session.display_name;

		// Implement the show/hide password buttons, as well as password
		// validation
		for (let div_row_password of main.querySelectorAll('div.row.password')) {
			_init_toggle_show_password_button(div_row_password);
		}

		// Implement the password meter
		const inp_password_new = main.getElementById("password_new");
		const prg_password_strength = main.getElementById("prg_password_strength");
		const lbl_password_strength = main.getElementById("lbl_password_strength");
		inp_password_new.addEventListener('keyup', () =>
			_score_password(inp_password_new, prg_password_strength, lbl_password_strength));
		inp_password_new.addEventListener('change', () =>
			_score_password(inp_password_new, prg_password_strength, lbl_password_strength));

		// Implement form validation
		const inp_password = main.getElementById("password");
		const inp_password_new_repeat = main.getElementById("password_new_repeat");
		const lbl_password_error = main.querySelector("label[for='password'] span.error");
		const lbl_password_new_error = main.querySelector("label[for='password_new'] span.error");
		const lbl_password_new_repeat_error = main.querySelector("label[for='password_new_repeat'] span.error");
		const validate_display_name = () => {
			return _validate_display_name(root, 'display_name',
				inp_display_name, lbl_display_name_error);
		};
		const validate_password = (is_final) => {
			return _validate_password(root, 'password',
				inp_password, inp_password_new, inp_password_new_repeat,
				lbl_password_error, lbl_password_new_error,
				lbl_password_new_repeat_error, session.reset_password, is_final);
		};
		inp_display_name.addEventListener('change', validate_display_name);
		inp_password.addEventListener('change', validate_password);
		inp_password.addEventListener('blur', () => validate_password(true));
		inp_password_new.addEventListener('change', validate_password);
		inp_password_new_repeat.addEventListener('change', validate_password);

		// Setup the back button and hide/show certain sections depending on
		// whether we're in "reset_password" mode.
		const btn_back = main.getElementById("btn_back");
		if (session.reset_password) {
			btn_back.setAttribute('disabled', 'disabled');
			sec_user_details.style.display = 'none';
		} else {
			sec_force_change_password.style.display = 'none';
			view.utils.setup_back_button(btn_back);
		}

		// Action being performed when the form is submitted
		function _submit_preferences(e) {
			// Do not perform the default form/button action
			e.preventDefault();

			// Collect all the things that should be updated
			let check_password_promise = null;
			let updated_user_properties = {};

			// Check if display_name has been changed
			if (inp_display_name.value != session.display_name) {
				if (!validate_display_name()) {
					return;  // Errors for validation are shown live, don't need
					// to do anything here
				}
				updated_user_properties.display_name = inp_display_name.value;
			}

			// If anything is typed into a password field, assume the user wants
			// to update their password
			if (session.reset_password ||
				(inp_password.value.length > 0) ||
				(inp_password_new.value.length > 0) ||
				(inp_password_new_repeat.value.length > 0)) {
				if (!validate_password(true)) {
					return;  // Errors for validation are shown live, don't need
					// to do anything here
				}

				// Make sure that the old password is correct, and, at the same
				// time, encrypt/hash the current password
				check_password_promise = Promise.all([
					api.encrypt_password(inp_password_new.value),
					api.check_password(session.name, inp_password.value),
				]).then((data) => {
					if (data[1]) {
						updated_user_properties.password = data[0].password;
						inp_password.classList.toggle('ok', true);
						return true;
					} else {
						l10n.set_node_text(lbl_password_error, 'Password is incorrect');
						inp_password.focus();
						inp_password.classList.toggle('error', true);
						inp_password.classList.toggle('ok', false);
						return false;
					}
				}).catch((err) => {
					view.utils.show_error_dialogue(root, err);
				});
			}

			// If we don't need to check the password, replace the corresponding
			// promise with a dummy.
			if (check_password_promise == null) {
				check_password_promise = new Promise((resolve, _) => resolve(true));
			}

			// Show the loading screen while we're waiting for the server
			// response
			const div_overlay = view.utils.show_loading_overlay(root);
			check_password_promise.then((ok) => {
				// Do nothing in case there has been an error
				if (!ok) {
					div_overlay.remove();
					return false;
				}

				// Close the loading overlay and go back
				return api.update_user(updated_user_properties).then(() => {
					div_overlay.remove();
					events.on_back();
				});
			}).catch((e) => {
				view.utils.show_error_dialogue(root, e);
			});
		}

		// Intercept the form being submitted
		const frm_preferences = main.getElementById("frm_preferences");
		frm_preferences.addEventListener("submit", _submit_preferences);

		// Force the form being submitted if one of the buttons is pressed
		for (let btn of main.querySelectorAll("button[name=btn_save]")) {
			btn.addEventListener('click', _submit_preferences);
		}

		// Delete the current content of the root element and replace it with
		// the body element.
		utils.replace_content(root, main);

		// Prevent autocompletion of the password input
		inp_password.value = "";
		for (let t = 0; t < 200; t += 10) {
			window.setTimeout(() => inp_password.value = "", t);
		}

		// In case we're in the forced password replacement mode, focus the
		// confirm password field
		if (session.reset_password) {
			inp_password.focus();
		}
	}

	function create_preferences(api, root) {
		return new Promise((resolve, reject) => {
			const events = {
				// Triggered whenever the preferences are supposed to be
				// closed. Per default, just go to the last page.
				"on_back": () => window.history.back(),
			};
			api.get_session_data().then((data) => {
				const session = data.session;
				show_preferences(api, root, events, session);
			});
			resolve(events);
		});
	}

	return {
		'create': create_preferences
	};
})();
