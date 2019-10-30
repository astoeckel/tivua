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
 * @file login.js
 *
 * View code for the login page.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.login = (function() {
	"use strict";

	// Module aliases
	const colors = tivua.colors;
	const time = tivua.time;
	const utils = tivua.utils;

	function _disable_input(root) {
		const disabled = [];
		for (let elem of root.querySelectorAll("button, input, select")) {
			if (!elem.hasAttribute("disabled")) {
				disabled.push(elem);
				elem.setAttribute("disabled", "disabled");
			}
		}
		return disabled;
	}

	function _enable_input(root) {
		let list = root;
		if (!Array.isArray(list)) {
			list = root.querySelectorAll("button, input, select");
		}
		let first = true;
		for (let elem of list) {
			elem.removeAttribute("disabled");
			if (first) {
				elem.focus();
				first = false;
			}
		}
	}

	function _show_login_page(main, page) {
		function idx(child) {
			let i = 0;
			while ((child = child.previousSibling) != null) {
				i++;
			}
			return i;
		}

		// Disable all form elements on all pages
		const container = main.querySelector(".container");
		_disable_input(container);

		// Select the currently active and the target page
		const pg_active = main.querySelector(".page.active");
		const pg_target = main.querySelector("#pg_" + page);

		// Set all pages but the target page invisible
		for (let elem of main.querySelectorAll(".page")) {
			if (elem != pg_target) {
				elem.style.display = "none";
			} else {
				elem.style.display = null;
			}
		}

		// Mark the target page as active
		pg_target.classList.add("active");
		if (pg_active) {
			pg_active.classList.remove("active");
		}

		// Enable all form elements on the active page
		_enable_input(pg_target);
	}

	/**
	 * Generates the login view and places it in the given root container.
	 * This function is responsible for removing form elements that correspond
	 * to currently unavailble 
	 */
	function _show_login_view(root, callbacks, methods, logout) {
		const l10n = tivua.l10n;

		// Fetch the login view template
		const main = utils.import_template('tmpl_login_view');
		const main_cntr = main.querySelector(".login_container");
		const scrl_cnt = main.querySelector(".container")

		// Fetch the buttons in the template
		const btn_cas = main.getElementById("btn_cas");
		const btn_username_password = main.getElementById("btn_username_password");
		const btn_username_password_back = main.getElementById("btn_username_password_back");
		const btn_login = main.getElementById("btn_login");
		const sel_language = main.getElementById("language");
		const frm_username_password = main.getElementById("frm_username_password");
		const inp_username = main.getElementById("username");
		const inp_password = main.getElementById("password");
		const lbl_err_username = main.querySelector("form label[for='username'] .error");
		const lbl_err_password = main.querySelector("form label[for='password'] .error");

		function _reset_login_username_password_error(has_username=true, has_password=true) {
			inp_username.classList.toggle("error", !has_username);
			inp_password.classList.toggle("error", !has_password);

			l10n.set_node_text(lbl_err_username, has_username ? "" : "%error_msg_enter_username");
			l10n.set_node_text(lbl_err_password, has_password ? "" : "%error_msg_enter_password");
		}

		// Remove buttons that are not available right now
		let first_page = 'login_sel_method';
		let n_methods = 2;
		if (!methods.cas) {
			btn_cas.parentNode.removeChild(btn_cas);
			first_page = 'login_username_password';
			n_methods--;
		}
		if (!methods.username_password) {
			btn_username_password.parentNode.removeChild(btn_username_password);
			n_methods--;
		}
		// We don't need the "back" buttons if there is only one login method
		if (n_methods == 1) {
			btn_username_password_back.parentNode.removeChild(btn_username_password_back);
		}

		// Remove the "no login method" error method if there is at least one
		// login method
		if (n_methods > 0) {
			let lbl = main.getElementById("lbl_no_method");
			lbl.parentNode.removeChild(lbl);
		} else {
			first_page = 'login_sel_method';
		}

		// Construct the list of languages
		for (let language in l10n.data) {
			if ("%_language_name" in l10n.data[language]) {
				let option = document.createElement("option");
				option.value = language;
				option.innerText = l10n.data[language]["%_language_name"];
				sel_language.appendChild(option);
			}
		}
		sel_language.value = l10n.get_locale();

		// Connect event listeners
		btn_username_password.addEventListener('click', e => {
			_reset_login_username_password_error();
			_show_login_page(main_cntr, 'login_username_password');
			e.preventDefault();
		});
		btn_username_password_back.addEventListener('click', e => {
			_show_login_page(main_cntr, 'login_sel_method');
			e.preventDefault();
		});
		btn_cas.addEventListener('click', e => {
			btn_cas.classList.add("busy");
			let disabled = _disable_input(root);
			callbacks
				.on_login_cas(inp_username.value, inp_password.value)
				.catch((error) => {
					// TODO
				})
				.finally(() => {
					// Remove the busy marker
					btn_cas.classList.remove("busy");

					// Restore the disabled elements
					_enable_input(disabled);
				});
		});
		frm_username_password.addEventListener('submit', e => {
			// Make sure the username and password were entered
			inp_username.value = inp_username.value.trim();
			const has_username = inp_username.value && true;
			const has_password = inp_password.value && true;

			_reset_login_username_password_error(has_username, has_password);

			if (!has_username) {
				inp_username.focus();
			} else if (!has_password) {
				inp_password.focus();
			} else {
				btn_login.classList.add("busy");
				let disabled = _disable_input(root);
				callbacks
					.on_login_username_password(inp_username.value, inp_password.value)
					.catch((error) => {
						// Display the error message
						_reset_login_username_password_error(false, false);
						l10n.set_node_text(lbl_err_username, error["what"]);
						l10n.set_node_text(lbl_err_password, "");

						// Remove the busy marker
						btn_login.classList.remove("busy");

						// Restore the disabled elements
						_enable_input(disabled);
						inp_username.focus();
					});
			}
			e.preventDefault();
		});
		sel_language.addEventListener('change', e => {
			l10n.set_locale(sel_language.value);
		});

		// Show the first login page without login
		_show_login_page(main_cntr, first_page);

		// Replace the current DOM tree with the login view
		utils.replace_content(root, main);

		// Focus the username input field if this is the only login method
		if (n_methods == 1 && methods.username_password) {
			inp_username.focus();
		}
	}

	function create_login_view(api, root, logout=false) {
		const login_view = {
			"on_login_cas": () => { throw "Not implemented"; },
			"on_login_username_password": () => { throw "Not implemented"; }
		};

		let promises = [api.get_configuration()];
		if (logout) {
			promises.push(api.post_logout());
		}

		return Promise.all(promises).then((data) => {
			_show_login_view(root, login_view,
				data[0].configuration.login_methods, logout);
			return login_view;
		});
	}

	return {
		'create': create_login_view,
	};
})();
