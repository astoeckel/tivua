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
 * @file utils.js
 *
 * View utility code.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.utils = (function() {
	"use strict";

	// Module aliases
	const utils = tivua.utils;

	function _show_modal(root, elem, replace=true) {
		// Create the overlay div
		const div_overlay = document.createElement("div");
		div_overlay.classList.add("overlay");
		div_overlay.classList.add("opaque");
		div_overlay.setAttribute("tabIndex", "999");

		// Discard some events
		const discard = (e) => { e.stopPropagation(); }
		div_overlay.addEventListener("wheel", discard, {"capture": true});

		// Either replace the entire view or just append the dialogue to the
		// stack
		div_overlay.appendChild(elem);
		if (replace) {
			utils.replace_content(root, div_overlay)
		} else {
			root.appendChild(div_overlay);
		}

		// Focus the overlay
		div_overlay.focus();
	}

	function show_loading_overlay(root) {
		const div_busy = document.createElement("div");
		div_busy.classList.add("busy");
		_show_modal(root, div_busy, false);
	}

	function _execute_action(action) {
		if (("uri" in action) && action["uri"]) {
			if (action["uri"].charAt(0) == '#') {
				window.location.hash = action.uri;
			} else if (action["uri"] == "/") {
				const loc = window.location.toString();
				const hi = loc.indexOf("#")
				window.location = loc.substr(0, hi >= 0 ? hi : loc.length);
			} else {
				window.location = action["uri"];
			}
		}
	}

	function show_dialogue(root, title, message, actions, replace=false) {
		const l10n = tivua.l10n;

		// Set the title and message
		const tmpl_dialogue = utils.import_template('tmpl_dialogue');
		const lbl_title = tmpl_dialogue.querySelector('h1');
		const lbl_msg = tmpl_dialogue.querySelector('.message');
		l10n.set_node_text(lbl_title, title);
		l10n.set_node_text(lbl_msg, message);

		// Create the actions
		const div_buttons = tmpl_dialogue.querySelector(".buttons");
		for (let action of actions) {
			switch (action.type) {
				case "delay":
					const prg = document.createElement("progress");
					prg.setAttribute("max", action.value);
					prg.setAttribute("value", 0);
					div_buttons.appendChild(prg);
					let ival_box = {};
					ival_box.content = window.setInterval(() => {
						const value = parseInt(prg.getAttribute("value"));
						const max = parseInt(prg.getAttribute("max"));
						if (value >= max) {
							window.clearInterval(ival_box.content);
							_execute_action(action);
						} else {
							prg.setAttribute("value",  parseInt(value) + 1);
						}
					}, 1000);
				}
		}

		// Show the dialogue
		_show_modal(root, tmpl_dialogue, replace);
	}

	function setup_back_button(btn_back) {
		if (window.history.length <= 1) {
			btn_back.setAttribute("disabled", "disabled");
		}
		btn_back.addEventListener("click", (e) => window.history.back());
	}

	return {
		'show_dialogue': show_dialogue,
		'show_loading_overlay': show_loading_overlay,
		'setup_back_button': setup_back_button
	};
})();
