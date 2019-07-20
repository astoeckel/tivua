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

	function create_editor_view(api, root) {
		return new Promise((resolve, reject) => {
			tivua.spellcheck.init().then(() => {
				show_editor_view();
				resolve(null);
			}).catch((err) => reject(err))
		});
	}

	return {
		'create': create_editor_view
	};
})();
