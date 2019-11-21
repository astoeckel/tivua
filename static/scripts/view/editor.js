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
	const view = tivua.view;

	// Constants used for keyword validation
	// TODO: Use server configuration
	const KEYWORDS_MIN_LEN = 2;
	const KEYWORDS_MAX_LEN = 30;
	const KEYWORDS_MAX_COUNT = 10;
	const KEYWORDS_SPLIT_RE = /"[\n;:().,!?/]"/;

	function _validate_author(users, btn_save, sel_author, span_author_error) {
		const l10n = tivua.l10n;
		let author_id = -1;
		if ((sel_author.value | 0) === parseInt(sel_author.value)) {
			author_id = sel_author.value | 0;
		}
		let valid = false;
		for (let author of users) {
			if (author_id > 0 && author_id == author.uid) {
				valid = true;
				break;
			}
		}

		view.utils.update_error_state(btn_save, 'author', valid);
		sel_author.classList.toggle('error', !valid);
		l10n.set_node_text(span_author_error, valid ? '' : '%err_author');
		return valid;
	}

	function _validate_date(btn_save, inp_date, span_date_error) {
		const valid = tivua.utils.string_to_utc_date(inp_date.value) !== null;
		view.utils.update_error_state(btn_save, 'date', valid);
		inp_date.classList.toggle('error', !valid);
		tivua.l10n.set_node_text(span_date_error, valid ? '' : '%err_date_format');
		return valid;
	}

	function _validate_keywords(btn_save, inp_keywords, inp_keywords_wrapper, span_keywords_error) {
		const keywords = inp_keywords.value.split(KEYWORDS_SPLIT_RE).map(s => s.trim()).filter(s => !!s);
		let valid = keywords.length <= KEYWORDS_MAX_COUNT;
		for (let keyword of keywords) {
			valid = valid && (keyword.length <= KEYWORDS_MAX_LEN) && (keyword.length >= KEYWORDS_MIN_LEN);
		}
		view.utils.update_error_state(btn_save, 'keywords', valid);
		inp_keywords_wrapper.classList.toggle('error', !valid);
		tivua.l10n.set_node_text(span_keywords_error, valid ? '': '%err_keywords');
		return valid;
	}

	function show_editor_view(api, root, events, users, session, post) {
		const l10n = tivua.l10n;

		/* Instantiate the editor view DOM nodes */
		const main = utils.import_template('tmpl_editor_view');

		/* Fetch references at all UI components */
		const sel_author = main.getElementById('sel_author');
		const span_author_error = main.querySelector('label[for=sel_author] span');

		const inp_date = main.getElementById('inp_date');
		const span_date_error = main.querySelector('label[for=inp_date] span');

		const inp_keywords = main.getElementById('inp_keywords');
		const span_keywords_error = main.querySelector('label[for=inp_keywords] span');

		const inp_content = main.getElementById('inp_content');
		const span_content_error = main.querySelector('label[for=inp_content] span');

		const btn_back = tivua.view.utils.setup_back_button(
			main.getElementById("btn_back"), root);
		const btn_save = main.getElementById('btn_save');
		const btn_delete = main.getElementById('btn_delete');

		/* Append the indentation code to the textarea */
		const editor = CodeMirror.fromTextArea(inp_content, {
			'lineNumbers': false,
			'backdrop': 'markdown',
			'theme': 'tango',
			'indentWithTabs': true,
			'electricChars': false,
			'lineWrapping': true
		});

		/* Add all possible users to the dropdown list */
		users = Object.values(users).sort((a, b) => a.display_name.localeCompare(b.display_name));
		for (let author of users) {
			if (author.uid != 0) {
				const option = document.createElement("option");
				option.setAttribute("value", author.uid);
				option.innerText = author.display_name;
				sel_author.appendChild(option);
			}
		}

		/* If "post" is not null/undefined, this means that we're editing an
		   existing post. */
		const create_post = !post;
		if (post) {
			l10n.set_node_text(main.querySelector("h1"), "%header_edit_entry");
			l10n.set_node_text(main.querySelector("#btn_save .caption"), "%btn_save");

			sel_author.value = post["author"];
			inp_date.value = utils.format_date(post["date"], "-");
			inp_keywords.value = post["keywords"] ? post["keywords"].join(",") : "";

			editor.getDoc().setValue(post["content"]);
		} else {
			/* Otherwise, we're creating a new post. Set some sane defaults for
			   the author and the date. */
			main.querySelector("#btn_delete").style.display = "none";
			sel_author.value = session["uid"];
			inp_date.value = utils.format_date(utils.get_now_as_utc_date(), '-');
		}

		const inp_keywords_tagger = tagger(inp_keywords);
		const autocomplete = new autoComplete({
			"minChars": 2,
			"delay": 50,
			"selector": inp_keywords_tagger._new_input_tag,
			"anchor": inp_keywords_tagger._wrapper,
			"source": (term, response) => {
				/* Trim the given term and make sure it is still long enough */
				term = term.toLowerCase().trim();
				if (term.length < 2) {
					response([]);
					return;
				}

				/* Request the keywords from the server */
				api.get_keyword_list().then((keywords) => {
					/* Filter for the keywords containing the current term,
					   sort by occurance count and overlap. */
					const res = {};
					for (let keyword in keywords.keywords) {
						const count = keywords.keywords[keyword];
						if (keyword.includes(term)) {
							const weight = count * Math.sqrt(term.length / keyword.length);
							res[keyword] = weight;
						}
					}
					response(Object.keys(res).sort((a, b) => res[b] - res[a]));
				});
			},
			"offsetTop": -3,
			"root": main,
		});

		/* Hook up all validation code */
		let validate_author = () => _validate_author(users, btn_save, sel_author, span_author_error);
		let validate_date = () => _validate_date(btn_save, inp_date, span_date_error);
		let validate_keywords = () => _validate_keywords(btn_save, inp_keywords, inp_keywords_tagger._wrapper, span_keywords_error);

		sel_author.addEventListener('change', validate_author);
		inp_date.addEventListener('change', validate_date);
		inp_keywords.addEventListener('change', validate_keywords);

		/* Hook up the delete button */
		btn_delete.addEventListener("click", function () {
			const dialogue = {"instance": null};
			dialogue.instance = view.utils.show_dialogue(root, "%header_confirm_delete", "%msg_confim_delete",
			[
				{
					"type": "button",
					"icon": "delete",
					"caption": "%msg_confirm_delete_yes",
					"callback": () => {
						const div_overlay = view.utils.show_loading_overlay(root);
						api.delete_post(post['pid']).then(() => {
							div_overlay.close();
							window.history.back();
						});
					}
				},
				{
					"type": "button",
					"caption": "%msg_confirm_delete_no",
					"icon": "cancel",
					"callback": () => dialogue.instance.close(),
					"role": "cancel"
				}
			]);
		});

		/* Hook up the creation/updating of a post */
		btn_save.addEventListener("click", function () {
			/* Validate all input fields */
			if (!validate_author() || !validate_date()) {
				return;
			}

			/* Try to convert the date input to a Date object */
			const date = tivua.utils.string_to_utc_date(inp_date.value);
			if (date == null) {
				inp_date.classList.add('error');
			}

			/* Show the loading overlay */
			const div_overlay = tivua.view.utils.show_loading_overlay(root);

			/* Assemble a new post with the information entered by the user */
			const new_post = {
				'author': sel_author.value,
				'date': date.getTime() / 1000,
				'content': editor.getDoc().getValue(),
				'keywords': inp_keywords.value.split(',').filter(s => (s.trim()).length > 0),
				'revision': post ? post['revision'] : 0,
			};

			let api_call = null;
			if (create_post) {
				api_call = api.create_post(new_post);
			} else {
				api_call = api.update_post(post.pid, new_post);
			}
			api_call.then((data) => {
				// Remove this loading bar, a new one will be added once
				// we go to the next page
				div_overlay.close();

				// Go to the previous page
				events.on_back();
			});
		});

		tivua.spellcheck.init().then(typo => {
			tivua.spellcheck.start(editor, typo)
		});

		/* Require confirmation if any change is made */
		const needs_confirmation = () => {
			btn_back.needs_confirmation = true;
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

	function create_editor_view(api, root, pid) {
		return new Promise((resolve, reject) => {
			/* Callbacks for this view */
			const events = {
				"on_back": () => { throw "Not implemented"; }
			};

			/* Canonicalise the "pid" parameter */
			pid = (pid === undefined) ? undefined : (pid | 0);

			/* Initialise the spellchecker, load the list of users, and -- if
			   applicable -- the requested post */
			const promises = [
				tivua.spellcheck.init(),
				api.get_user_list(),
				api.get_session_data(),
			];
			if (pid >= 0) {
				promises.push(api.get_post(pid));
			}

			/* Show the editor */
			Promise.all(promises).then((data) => {
				const users = data[1].users;
				const session = data[2].session;
				const post = (promises.length > 3) ? data[3].post : null;
				show_editor_view(api, root, events, users, session, post);
				resolve(events);
			}).catch((err) => reject(err));
		});
	}

	return {
		'create': create_editor_view
	};
})();
