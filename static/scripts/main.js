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

this.tivua = this.tivua || {};
this.tivua.main = (function () {
	"use strict";

	// Module aliases
	const colors = tivua.colors;
	const time = tivua.time;
	const utils = tivua.utils;

	// Number of additional posts queried at the beginning and the end of the
	// current page to ensure that full weeks are displayed.
	let main_view_overlap = 25; 

	// Current number of posts per page
	let main_view_posts_per_page = 100;
	let main_view_page = 0;

	// Possible page counts in the select box. Negative value stands for "all"
	// posts.
	const main_view_posts_per_page_list = [50, 100, 250, 500, -1];


	function _update_main_view_pagination(view, total, page, i0, i1) {
		// Update the post counter
		view.querySelector("#lbl_post_start").innerText = i0;
		view.querySelector("#lbl_post_end").innerText = i1;
		view.querySelector("#lbl_post_total").innerText = total;

		// Update the page select box
		const n_pages = Math.ceil(total / main_view_posts_per_page);
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
		})

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

	function show_main_view(page) {
		// Compute the query range
		const s0 = page * main_view_posts_per_page;
		const s1 = (page + 1) * main_view_posts_per_page;
		const s0ext = Math.max(0, s0 - main_view_overlap);
		const s1ext = s1 + main_view_overlap;

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
				if ((i0 >= s0 && i0 < s1) || (i1 >= s0 && i1 < s1)) {
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
			const body = document.getElementsByTagName('body')[0];
			utils.replace_content(body, view);
		});
	}

	function show_editor_view() {
		/* Instantiate the editor view DOM nodes */
		const body = document.getElementsByTagName('body')[0];
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

		/* Delete the current body content */
		tivua.utils.replace_content(body, main);

		/* Inform the editor about the DOM update */
		editor.refresh();
	}

	function init() {
		/* Load the spellcheck dictionaries */
		tivua.spellcheck.init().then(_ => {
			show_main_view(0);
			/*show_editor_view();*/
		});
	}

	return {
		'init': init,
	};
})();

window.addEventListener('load', tivua.main.init);
