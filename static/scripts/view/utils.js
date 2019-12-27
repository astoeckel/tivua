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
		div_overlay["close"] = () => {
			try {
				root.removeChild(div_overlay);
			} catch (e) {
				console.error(e); // Node was not found, don't despair!
			}
		};
		return div_overlay;
	}

	function show_loading_overlay(root) {
		const div_busy = document.createElement("div");
		div_busy.classList.add("busy");
		return _show_modal(root, div_busy, false);
	}

	function show_dialogue(root, title, message, actions, replace=false) {
		const l10n = tivua.l10n;

		// Set the title and message
		const tmpl_dialogue = utils.import_template('tmpl_dialogue');
		const lbl_title = tmpl_dialogue.querySelector('h1');
		const lbl_msg = tmpl_dialogue.querySelector('.message');
		l10n.set_node_text(lbl_title, title);
		if ((message instanceof HTMLElement) ||
		    (message instanceof DocumentFragment)) {
			l10n.translate_dom_tree(message);
			lbl_msg.appendChild(message);
		} else {
			l10n.set_node_text(lbl_msg, message);
		}

		// Create the actions
		let div_buttons = tmpl_dialogue.querySelector(".buttons");
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
							utils.execute_action(action);
						} else {
							prg.setAttribute("value",  parseInt(value) + 1);
						}
					}, 1000);
					break;
				case "button":
					const btn = document.createElement("button");
					if (action.icon) {
						btn.setAttribute("class", "btn_" + action.icon);
					} else if (action.uri && action.uri == "/") {
						btn.setAttribute("class", "btn_reload");
					}

					const btn_icon = document.createElement("span");
					btn_icon.setAttribute("class", "icon");

					const btn_caption = document.createElement("span");
					btn_caption.setAttribute("class", "caption");

					btn.appendChild(btn_icon);
					btn.appendChild(btn_caption);

					l10n.set_node_text(btn_caption, action.caption);
					btn.addEventListener("click", utils.exec(action));
					div_buttons.appendChild(btn);
					break;
			}
		}

		// Show the dialogue
		const div_overlay = _show_modal(root, tmpl_dialogue, replace);

		// Add event listeners that need to be attached to the overlay
		for (let action of actions) {
			switch (action.role) {
				case "cancel":
					div_overlay.addEventListener("keyup", (e) => {
						if (e.keyCode === 27) {
							utils.execute_action(action);
						}
					});
					break;
			}
		}

		// Focus the last button
		if (div_buttons.childNodes.length > 0) {
			div_buttons.lastChild.focus();
		}

		return div_overlay;
	}

	function show_error_dialogue(root, e) {
		const frag_msg = document.createDocumentFragment();

		if (e.what) {
			e = e.what;
		} else if (!(e instanceof Error)) {
			e = e.toString();
		}

		const lbl_generic_information = document.createElement("div");
		lbl_generic_information.innerText = "%lbl_msg_generic";
		frag_msg.appendChild(lbl_generic_information);

		const lbl_more_information = document.createElement("h2");
		lbl_more_information.innerText = "%lbl_msg_more_information";
		frag_msg.appendChild(lbl_more_information);

		if (typeof e === "string") {
			const lbl_information = document.createElement("div");
			lbl_information.innerText = e;
			frag_msg.appendChild(lbl_information);
		} else {
			const lbl_information = document.createElement("div");
			if (e.fileName && e.lineNumber) {
				lbl_information.innerText =
					"An exception of type \""
						+ e.name + "\" occured at \""
						+ e.fileName + "\", line "
						+ e.lineNumber + ".";
			} else {
				lbl_information.innerText =
					"An exception of type \""
						+ e.name + "\" occured.";
			}
			frag_msg.appendChild(lbl_information);

			const pre_message = document.createElement("pre");
			pre_message.innerText = e.message;
			frag_msg.appendChild(pre_message);

			if (e.stack) {
				const lbl_stack_trace = document.createElement("h2");
				lbl_stack_trace.innerText = "%lbl_stack_trace";
				frag_msg.appendChild(lbl_stack_trace);

				const pre_stack = document.createElement("pre");
				pre_stack.innerText = e.stack;
				frag_msg.appendChild(pre_stack);
			}
		}

		tivua.view.utils.show_dialogue(root,
			"%header_error",
			frag_msg,
			[
				{
					"type": "button",
					"uri": "/",
					"caption": "%btn_home",
					"role": "cancel",
				}
			]);
	}

	function setup_back_button(btn_back, root=null) {
		const res = {
			"needs_confirmation": false
		};
		if (window.history.length <= 1) {
			btn_back.setAttribute("disabled", "disabled");
		}
		btn_back.addEventListener("click", (e) => {
			if (res.needs_confirmation) {
				const dialogue = {"instance": null};
				dialogue.instance = show_dialogue(root ? root : document.body,
					"%header_confirm",
					"%msg_confirm",
					[
						{
							"type": "button",
							"icon": "confirm",
							"caption": "%msg_confirm_yes",
							"callback": () => window.history.back(),
						},
						{
							"type": "button",
							"caption": "%msg_confirm_no",
							"icon": "cancel",
							"callback": () => dialogue.instance.close(),
							"role": "cancel"
						}
					]
				)
			} else {
				window.history.back();
			}
		});
		return res;
	}

	/**
	 * Used internally to disable the "save" button as long as there is at least
	 * one validation error.
	 */
	function update_error_state(btn, field_name, valid) {
		/* Fetch the fields that are currently marked as invalid */
		const fields = (btn.getAttribute('data-error-state') || '')
			.split(' ')
			.filter(s => s.length > 0);

		/* Either add or remove the given field from the list of fields */
		const idx = fields.indexOf(field_name);
		if (valid) {
			if (idx >= 0) {
				fields.splice(idx, 1);
			}
		} else {
			if (idx < 0) {
				fields.push(field_name);
			}
		}

		/* Store the list of fields with validation error in the button */
		btn.setAttribute('data-error-state', fields.join(' '));

		/* Disable the buttons if there is at least one validation error */
		if (fields.length > 0) {
			btn.setAttribute('disabled', 'disabled');
		} else {
			btn.removeAttribute('disabled');
		}
		return fields.length == 0;
	}

	return {
		'show_dialogue': show_dialogue,
		'show_error_dialogue': show_error_dialogue,
		'show_loading_overlay': show_loading_overlay,
		'setup_back_button': setup_back_button,
		'update_error_state': update_error_state,
	};
})();
