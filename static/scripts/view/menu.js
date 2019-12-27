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
this.tivua.view.menu = (function() {
	"use strict";

	// Module aliases
	const utils = tivua.utils;

	function show_menu(api, root, events, session, settings) {
		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_menu');
		const div_menu = main.querySelector(".menu");
		const div_overlay = main.querySelector("div.overlay");

		/* Fetch the color associated wit the user */
		const user_color = tivua.colors.author_id_to_color(session.uid, true);

		/* Setup the user information */
		const h1_user = main.querySelector("h1");
		h1_user.style.backgroundColor = user_color;

		const span_user_emblem = main.querySelector(".user_emblem");
		span_user_emblem.style.color = user_color;

		const span_user_initials = main.querySelector(".user_initials");
		span_user_initials.innerText = session.display_name.charAt(0);

		const span_user_name = main.querySelector(".user_name");
		span_user_name.innerText = session.display_name;

		/* Hide the "Manage users" button if the current user is not an
		   administrator */
		const a_users = main.querySelector("a[href='#users']");
		if (session.role != "admin") {
			a_users.style.display = "none";
		}

		/* Query the current view preferences (list or card view) and mark the
		   buttons accordingly. */
		const btn_card_view = main.querySelector("#btn_card_view");
		const btn_list_view = main.querySelector("#btn_list_view");
		function show_settings(settings) {
			if (settings["view"] === "cards") {
				btn_card_view.classList.add("active");
			} else if (settings["view"] === "list") {
				btn_list_view.classList.add("active");
			}
		}
		show_settings(settings);

		function handle_btn_view_click(e) {
			/* Construct a new settings object */
			let settings = {
				"view": this
			};

			/* Send the settings to the server */
			api.post_settings(settings);

			/* Notify the opener and close the menu */
			events.on_set_view(this);
			events.on_close_menu();
		};
		btn_card_view.addEventListener("click", handle_btn_view_click.bind("cards"));
		btn_list_view.addEventListener("click", handle_btn_view_click.bind("list"));

		/* Hook up all close events */
		function close(e) {
			e.preventDefault();
			events.on_close_menu();
		}
		const a_close = main.querySelector("a.close");
		a_close.addEventListener("click", close);
		div_menu.addEventListener("click", (e) => { e.cancelBubble = true; })
		div_overlay.addEventListener("click", close);
		span_user_emblem.addEventListener("click", close);
		div_overlay.addEventListener("keyup", (e) => {
			if (e.keyCode == 27) {
				events.on_close_menu();
			}
		});

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);

		/* Focus the overlay */
		div_overlay.focus();
	}

	function create_menu(api, root) {
		return new Promise((resolve, reject) => {
			const events = {
				"on_set_view": () => { throw "Not implemented"; },
				"on_close_menu": () => { throw "Not implemented"; },
			};

			const promises = [
				api.get_session_data(),
				api.get_settings(),
			];

			Promise.all(promises).then((data => {
				show_menu(api, root, events, data[0].session, data[1].settings);
				resolve(events);
			}));
		});
	}

	return {
		'create': create_menu
	};
})();
