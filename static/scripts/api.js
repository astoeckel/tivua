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
this.tivua.api = (function (window) {
	function list_authors() {
		return new Promise((resolve, reject) => {
			resolve(DATA_AUTHORS.slice());
		});
	}

	function list_posts(start, limit) {
		return new Promise((resolve, reject) => {
			/* Select all posts */
			if (limit < 0) {
				limit = DATA_CONTENT.length;
			}

			/* Copy the given slice into a new array */
			let posts = DATA_CONTENT.slice(start, start + limit)

			/* Join the author data into the entries */
			for (let post of posts) {
				for (let key of ["user_name", "display_name"]) {
					post["author_" + key] = DATA_AUTHORS[post["author"]][key]
				}
			}

			/* Return the result object */
			resolve({
				"total": DATA_CONTENT.length,
				"posts": posts
			});
		});
	}

	function count_posts() {
		return new Promise((resolve, reject) => {
			resolve(DATA_CONTENT.length);
		});
	}

	function get_session() {
		return new Promise((resolve, reject) => {
			resolve(null);
		});
	}

	function get_configuration() {
		return new Promise((resolve, reject) => {
			resolve({
				"login_methods": {
					"username_password": true,
					"cas": true
				}
			});
		});
	}

	return {
		"list_authors": list_authors,
		"list_posts": list_posts,
		"count_posts": count_posts,
		"get_session": get_session,
		"get_configuration": get_configuration
	}
})(this);
