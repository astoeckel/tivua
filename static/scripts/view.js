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
 * @file view.js
 *
 * This file contains functions responsible for displaying the individual
 * views.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = (function() {
	"use strict";

	// Module aliases
	const colors = tivua.colors;
	const time = tivua.time;
	const utils = tivua.utils;
	const api  = tivua.api;

	/**************************************************************************
	 * LOGIN VIEW                                                             *
	 **************************************************************************/

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
	function _show_login_view(root, callbacks, methods) {
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
		sel_language.value = String.locale;

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
						l10n.set_node_text(lbl_err_username, error);
						l10n.set_node_text(lbl_err_password, "");
					})
					.finally(() => {
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
	}

	function create_login_view(root) {
		const login_view = {
			"on_login_cas": () => { throw "Not implemented"; },
			"on_login_username_password": () => { throw "Not implemented"; }
		};

		return api.get_configuration().then((config) => {
			_show_login_view(root, login_view, config.login_methods);
			return login_view;
		});
	}

	/**************************************************************************
	 * MAIN VIEW                                                              *
	 **************************************************************************/

	// Number of additional posts queried at the beginning and the end of the
	// current page to ensure that full weeks are displayed.
	const MAIN_VIEW_OVERLAP = 25; 

	// Possible page counts in the select box. Negative value stands for "all"
	// posts.
	const MAIN_VIEW_POSTS_PER_PAGE_LIST = [25, 50, 100, 250, 500, -1];

	// Current number of posts per page
	let main_view_posts_per_page = 50;
	let main_view_page = 0;

	/**
	 * Updates the pagination elements on the main view. 
	 */
	function _update_main_view_pagination(view, total, page, i0, i1) {
		// Update the post counter
		view.querySelector("#lbl_post_start").innerText = i0;
		view.querySelector("#lbl_post_end").innerText = i1;
		view.querySelector("#lbl_post_total").innerText = total;

		// Update the page select box
		const pp = (main_view_posts_per_page < 0) ? total : main_view_posts_per_page;
		const n_pages = Math.ceil(total / pp);
		const sel_page = view.querySelector("#sel_page");
		for (let i = 0; i < n_pages; i++) {
			const sel_page_option = document.createElement("option");
			sel_page_option.setAttribute("value", i);
			sel_page_option.innerText = "Page " + (i + 1);
			sel_page.appendChild(sel_page_option);
		}
		sel_page.value = page;
		sel_page.addEventListener("change", () => {
			show_main_view(sel_page.value | 0);
		});

		// Update the post count select box
		const sel_entry_count = view.querySelector("#sel_entry_count");
		for (let i = 0; i < MAIN_VIEW_POSTS_PER_PAGE_LIST.length; i++) {
			const sel_entry_count_option = document.createElement("option");
			const val = MAIN_VIEW_POSTS_PER_PAGE_LIST[i];
			sel_entry_count_option.setAttribute("value", val);
			if (val == -1)	{
				sel_entry_count_option.innerText = "All posts";
			} else {
				sel_entry_count_option.innerText = val + " per page";
			}
			sel_entry_count.appendChild(sel_entry_count_option);
		}
		sel_entry_count.value = main_view_posts_per_page;
		sel_entry_count.addEventListener("change", () => {
			main_view_posts_per_page = sel_entry_count.value;
			const pp = (main_view_posts_per_page < 0) ? total : main_view_posts_per_page;
			show_main_view(Math.floor(i0 / pp));
		});

		// Update the first/next buttons
		const btn_page_first  = view.querySelector("#btn_page_first");
		const btn_page_prev = view.querySelector("#btn_page_prev");
		const btn_page_next = view.querySelector("#btn_page_next");
		const btn_page_last  = view.querySelector("#btn_page_last");
		if (page <= 0) {
			btn_page_first.setAttribute("disabled", "disabled");
			btn_page_prev.setAttribute("disabled", "disabled");
		} else {
			btn_page_first.addEventListener("click", () => {
				show_main_view(0);
			});
			btn_page_prev.addEventListener("click", () => {
				show_main_view(page - 1);
			});
		}

		if (page + 1 >= n_pages) {
			btn_page_next.setAttribute("disabled", "disabled");
			btn_page_last.setAttribute("disabled", "disabled");
		} else {
			btn_page_next.addEventListener("click", () => {
				show_main_view(page + 1);
			});
			btn_page_last.addEventListener("click", () => {
				show_main_view(n_pages - 1);
			});
		}
	}

	function _format_date(timestamp) {
		const date = new Date(timestamp * 1000);
		return ("0000" + date.getUTCFullYear()).slice(-4)
		       + "/" + ("00" + (1 + date.getUTCMonth())).slice(-2)
		       + "/" + ("00" + ( date.getUTCDate())).slice(-2);
	}

	function _create_main_view_card(post) {
		const tmpl = utils.import_template('tmpl_main_view_card');
		tmpl.querySelector(".author").innerText = post["author_display_name"];
		tmpl.querySelector(".meta").setAttribute("style",
			  "color: " + colors.author_id_to_color(post["author"], false) + ";"
			+ "background-color: " + colors.author_id_to_color(post["author"], true) + ";");
		tmpl.querySelector(".date").innerText = _format_date(post["date"]);
		tmpl.querySelector("div.content").innerHTML = post["content"]; // XXX XSS prevention, parse markdown
		return tmpl;
	}

	function _create_main_view_week(week, year) {
		const tmpl = utils.import_template('tmpl_main_view_week');
		const d_week_start = time.week_number_to_date(week, year, 1);
		const d_week_end = time.week_number_to_date(week, year, 7);
		tmpl.querySelector("span.date_from").innerText =
			time.month_names[d_week_start.getUTCMonth()] + " " +
			d_week_start.getUTCDate();
		tmpl.querySelector("span.date_to").innerText =
			time.month_names[d_week_end.getUTCMonth()] + " " +
			d_week_end.getUTCDate();
		tmpl.querySelector("span.week").innerText = "Week " + week;
		tmpl.querySelector("span.year").innerText = "" + year;
		return tmpl;
	}

	function show_main_view(root, page) {
		// Compute the query range
		let s0 = 0, s1 = -1, s0ext = 0, s1ext = -1;
		if (main_view_posts_per_page > 0) {
			s0 = page * main_view_posts_per_page;
			s1 = (page + 1) * main_view_posts_per_page;
			s0ext = Math.max(0, s0 - MAIN_VIEW_OVERLAP);
			s1ext = s1 + MAIN_VIEW_OVERLAP;
		}

		// Query the posts in the range
		tivua.api.list_posts(s0ext, s1ext - s0ext).then((response) => {
			// Fetch the response parts
			const total = response["total"];
			const posts = response["posts"];

			// For each post compute the week and year, split the posts into
			// weeks
			const weeks = [];
			let cur_posts = null;
			let last_week = null;
			let i0 = s0ext, i1 = s0ext;
			let push_cur_posts = () => {
				// Make sure we actually have a non-empty week
				if (!last_week || !cur_posts) {
					return;
				}

				// Only add the week to the list if it overlaps with the
				// requested range
				if ((i0 >= s0 && i0 < s1) || (i1 >= s0 && i1 < s1) || s1 < 0) {
					// Sort posts by colour and date
					cur_posts.sort((a, b) => {
						const d_hue = colors.author_id_to_hue(a["author"]) - colors.author_id_to_hue(b["author"]);
						if (d_hue == 0) {
							return a["date"] - b["date"];
						}
						return d_hue;
					});

					/* Add the week to the list */
					weeks.push({
						"week": last_week,
						"posts": cur_posts,
						"i0": i0,
						"i1": i1
					});
				}
			};
			for (let i = 0; i < posts.length; i++) {
				const post = posts[i];
				const week = time.date_to_week_number(new Date(post["date"] * 1000));
				if (!last_week || last_week[0] != week[0] || last_week[1] != week[1]) {
					push_cur_posts();
					i0 = i1;
					cur_posts = [];
					last_week = week;
				}
				cur_posts.push(post);
				i1++;
			}
			push_cur_posts();

			// Update the navigation part of the main view
			const view = utils.import_template('tmpl_main_view');
			const main = view.querySelector("main");

			// Fetch the index of the first and last post
			const p0 = (weeks.length == 0) ? 1 : (weeks[0].i0 + 1);
			const p1 = (weeks.length == 0) ? 1 : (weeks[weeks.length - 1].i1);
			_update_main_view_pagination(view, total, page, p0, p1);

			// For each post create the corresponding card
			for (let week of weeks) {
				const week_ = week["week"];
				const posts_ = week["posts"];
				main.appendChild(_create_main_view_week(week_[0], week_[1]));

				const container = document.createElement("div");
				container.classList.add("card_container");
				main.appendChild(container);

				for (let post of posts_) {
					container.appendChild(_create_main_view_card(post));
				}
			}

			// Toggle view button
			const btn_view = view.querySelector("#btn_view")
			btn_view.addEventListener("click", () => {
				if (btn_view.classList.contains("table")) {
					main.classList.add("continuous");
				} else {
					main.classList.remove("continuous");
				}
				btn_view.classList.toggle("grid");
				btn_view.classList.toggle("table");
			});

			// Show the main view
			utils.replace_content(root, view);
			root.getRootNode().defaultView.scrollTo(0, 0);
		});
	}

	/**
	 * Returns a promise that is executed once the view components have been
	 * initialized.
	 */
	function create_main_view(root, page=0) {
		return new Promise((resolve, reject) => {
			show_main_view(root, page);
			resolve(null);
		});
	}

	/**************************************************************************
 	 * EDITOR VIEW                                                            *
	 **************************************************************************/

	function show_editor_view(root) {
		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_editor_view');

		/* Append the indentation code to the textarea */
		const inp_content = main.getElementById('inp_content');
		const editor = CodeMirror.fromTextArea(inp_content, {
			'lineNumbers': false,
			'backdrop': 'markdown',
			'theme': 'tango',
			'indentWithTabs': true,
			'electricChars': false,
			'lineWrapping': true
		});

		tivua.spellcheck.init().then(typo => {
			tivua.spellcheck.start(editor, typo)
		});

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);

		/* Inform the editor about the DOM update */
		editor.refresh();
	}

	function create_editor_view(root) {
		/* Load the spellcheck dictionaries */
		return tivua.spellcheck.init();
	}

	return {
		'create_login_view': create_login_view,
		'create_main_view': create_main_view,
/*		'create_editor_view': show_editor_view*/
	};
})();
