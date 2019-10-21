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
 * @file editor.js
 *
 * Implementation of the editor view.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.view = this.tivua.view || {};
this.tivua.view.editor = (function() {
	"use strict";

	// Module aliases
	const utils = tivua.utils;

	function _set_author(root, user_id) {
		if (root.querySelector(`#sel_author option[value="${user_id}"]`)) {
			root.querySelector("#sel_author").value = user_id;
		}
	}

	function show_editor_view(root, events, authors, session, post) {
		const l10n = tivua.l10n;

		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_editor_view');

		/* Setup the back button */
		const back_button = tivua.view.utils.setup_back_button(
			main.getElementById("btn_back"), root);

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

		/* Add all possible authors to the dropdown list */
		authors = authors.sort((a, b) => a.display_name.localeCompare(b.display_name));
		for (let author of authors) {
			const option = document.createElement("option");
			option.setAttribute("value", author.id);
			option.innerText = author.display_name;
			main.querySelector("#sel_author").appendChild(option);
		}

		/* Make changes relevant to editing a post instead of creating a new
		   one */
		if (post) {
			l10n.set_node_text(main.querySelector("h1"), "%header_edit_entry");
			l10n.set_node_text(main.querySelector("#btn_save .caption"), "%btn_save");

			_set_author(main, post["author"]);
			main.querySelector("#inp_date").value =
				utils.format_date(post["date"], "-");
			main.querySelector("#inp_keywords").value =
				post["keywords"] ? post["keywords"] : "";

			editor.getDoc().setValue(post["content"]);
		} else {
			main.querySelector("#btn_delete").style.display = "none";
			main.querySelector("#inp_date").value =
				utils.format_date(new Date(), "-");
			_set_author(main, session.user_id);
		}

		tivua.spellcheck.init().then(typo => {
			tivua.spellcheck.start(editor, typo)
		});

		/* Require confirmation if any change is made */
		const needs_confirmation = () => {
			back_button.needs_confirmation = true;
		};
		main.querySelector("#sel_author").addEventListener(
			"change", needs_confirmation);
		main.querySelector("#inp_date").addEventListener(
			"change", needs_confirmation);
		main.querySelector("#inp_keywords").addEventListener(
			"change", needs_confirmation);
		editor.on("change", needs_confirmation);

		/* Delete the current content of the root element and replace it with
		   the body element. */
		utils.replace_content(root, main);

		/* Inform the editor about the DOM update */
		editor.refresh();

		/* Focus the editor */
		editor.focus();
	}

	function create_editor_view(api, root, id) {
		return new Promise((resolve, reject) => {
			/* Callbacks for this view */
			const events = {
				"on_back": () => { throw "Not implemented"; }
			};

			/* Initialise the spellchecker, load the list of authors, and -- if
			 * applicable -- the requested post */
			const promises = [
				tivua.spellcheck.init(),
				tivua.api.get_author_list(),
				tivua.api.get_session_data(),
			];
			if (id >= 0) {
				promises.push(tivua.api.get_post(id));
			}

			/* Show the editor */
			Promise.all(promises).then((data) => {
				const authors = data[1].authors;
				const session = data[2].session;
				const post = (promises.length > 3) ? data[3].post : null;
				show_editor_view(root, events, authors, session, post);
				resolve(events);
			}).catch((err) => reject(err))
		});
	}

	return {
		'create': create_editor_view
	};
})();
