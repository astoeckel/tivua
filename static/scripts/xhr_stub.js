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
this.tivua.xhr = (function (window) {

	/* Set of generated challenges */
	const crypto_challenges = {};

	/* Time window for which challenges are valid. This should be fairly small;
	   challenges are usually requested by the client directly before sending
	   the login request. This value is in milliseconds */
	const crypto_challenge_timeout = 1 * 60 * 1000;

	/* A randomly generated cryptographic salt */
	const crypto_salt = "3b3ab44ac2d4a7d95fb5def3f485a6b55e4a3d67b41e061c7b3a05d9aec1ea59";

	/* List of users */
	const users = {
		1: {
			"user_name": "astoecke",
			"password_hash": "2fef31c115173ef2abd946a4cbd35afe980d40ff80ea6ff66e31c37e1a4afe34",
			"display_name": "Andreas Stöckel",
			"role": "admin",
		}
	};

	const user_settings = {};

	/* List of active sessions */
	const sessions = {
		"anonymous": 1
	}

	function _assert(x, msg) {
		if (!x) {
			throw {
				"status": "error",
				"what": msg,
			}
		}
		return x;
	}

	function _check_session(sid) {
		_assert(sid in sessions);
		return sessions[sid];
	}

	function _get_uid(user_name) {
		for (let key in users) {
			if (users[key]["user_name"] === user_name) {
				return key | 0;
			}
		}
		return null;
	}

	function _build_index() {
		
	}

	challenges = {}

	function get_user_list(sid) {
		return new Promise((resolve, reject) => {
			_check_session(sid);
			resolve({
				"status": "success",
				"authors": DATA_AUTHORS.slice()
			});
		});
	}

	function get_keyword_list(sid) {
		return new Promise((resolve, reject) => {
			_check_session(sid);
			let keywords = {};
			for (let post of DATA_CONTENT) {
				for (let keyword of (post["keywords"] || [])) {
					if (keyword in keywords) {
						keywords[keyword] += 1;
					} else {
						keywords[keyword] = 1;
					}
				}
			}
			resolve({
				"status": "success",
				"keywords": keywords,
			});
		});
	}

	function get_post(sid, id) {
		return new Promise((resolve, reject) => {
			_check_session(sid);

			/* Make sure "id" is an integer */
			id |= 0;

			/* Fetch the post with the given id */
			let posts = DATA_CONTENT.slice(); /* Make a copy */
			for (let post of DATA_CONTENT) {
				if (post.id === id) {
					for (let key of ["user_name", "display_name"]) {
						post["author_" + key] = DATA_AUTHORS[post["author"]][key];
					}
					resolve({
						"status": "success",
						"post": post
					});
					return;
				}
			}

			/* Post was not found */
			resolve({
				"status": "error",
				"what": "%post_not_found"
			});
		});
	}

	function _validate_and_canonicalise_post(post) {
		/* Make sure the post object is complete and that everything has the
		   right type. */
		const is_int = (x) => Math.trunc(x) == x;
		const is_str = (x) => (typeof x) === "string";
		const is_arr = (x) => Array.isArray(x);
		let valid = is_int(post["author"]) &&
		            is_int(post["date"]) &&
		            is_str(post["content"]) &&
		            (("keywords" in post) === is_arr(post["keywords"]));
		_assert(valid, "%server_error_validation");

		/* Make sure the author exists */
		valid = false;
		for (let author of DATA_AUTHORS) {
			if (author["id"] == post["author"]) {
				valid = true;
				break;
			}
		}
		_assert(valid, "%server_error_validation");

		/* Trim whitespaces in keywords, delete empty keywords, convert them to
		   lowercase, and make sure the keywords are unique. */
		if (!("keywords" in post)) {
			post["keywords"] = [];
		}
		let new_keywords = [];
		for (let keyword of post["keywords"]) {
			/* Make sure each keyword is a string */
			_assert(typeof keyword === "string", "%server_error_validation");

			/* Trim the keyword, and convert it to lower case */
			keyword = keyword.trim().toLowerCase();
			if (!keyword) {
				continue;
			}

			/* Make sure the keywords are shorter than 30 characters */
			_assert(keyword.length <= 30, "%server_error_validation");

			/* Make sure the keyword is unique */
			if (new_keywords.indexOf(keyword) >= 0) {
				continue;
			}

			/* Add the keyword to the list, make sure the number of keywords is
			   not too large */
			_assert(new_keywords.length < 10, "%server_error_validation");
			new_keywords.push(keyword);
		}
		post["keywords"] = new_keywords;
	}

	function post_create_post(sid, post) {
		return new Promise((resolve, reject) => {
			_check_session(sid);
			_validate_and_canonicalise_post(post);

			/* Create a new ID for the post */
			let id = 0;
			for (let post of DATA_CONTENT) {
				id = Math.max(post["id"] + 1, id);
			}

			/* Add the post */
			let new_post = {
				"author": post["author"],
				"date": post["date"],
				"content": post["content"],
				"keywords": post["keywords"],
				"id": id
			};
			DATA_CONTENT.push(new_post);

			/* Sort all posts by date */
			DATA_CONTENT = DATA_CONTENT.sort((a, b) => b["date"] - a["date"]);

			get_post(sid, id).then(resolve).catch(reject);
		});
	}

	function post_update_post(sid, pid, post) {
		// TODO
	}

	function get_post_list(sid, start, limit) {
		return new Promise((resolve, reject) => {
			_check_session(sid);

			/* Make sure start, limit are integers */
			start |= 0;
			limit |= 0;

			/* Select all posts */
			if (limit < 0) {
				limit = DATA_CONTENT.length;
			}

			/* Copy the given slice into a new array */
			let posts = DATA_CONTENT.slice(start, start + limit)

			/* Join the author data and the entries */
			for (let post of posts) {
				for (let key of ["user_name", "display_name"]) {
					post["author_" + key] = DATA_AUTHORS[post["author"]][key];
				}
			}

			/* Return the result object */
			resolve({
				"status": "success",
				"total": DATA_CONTENT.length,
				"posts": posts
			});
		});
	}

	function _get_session_data(sid) {
		const uid = sessions[sid]
		const user = users[uid];
		return {
			"sid": sid,
			"uid": uid,
			"user_name": user["user_name"],
			"display_name": user["display_name"],
			"role": user["role"],
		}
	}

	function get_session_data(sid) {
		return new Promise((resolve, reject) => {
			_check_session(sid);
			resolve({
				"status": "success",
				"session": _get_session_data(sid),
			});
		});
	}

	function get_configuration() {
		return new Promise((resolve, reject) => {
			resolve({
				"status": "success",
				"login_methods": {
					"username_password": true,
					"cas": true,
				}
			});
		});
	}

	function get_settings(sid) {
		return new Promise((resolve, reject) => {
			const uid = _check_session(sid);
			resolve({
				"status": "success",
				"settings": (uid in user_settings) ? user_settings[uid] : {},
			});
		});
	}

	function post_settings(sid, settings) {
		return new Promise((resolve, reject) => {
			const uid = _check_session(sid);
			if (!(uid in user_settings)) {
				user_settings[uid] = {};
			}

			const valid_settings= {
				"view": (x) => (x in {"list":0, "cards":1}),
				"posts_per_page": (x) => (x === (x | 0)),
			};

			for (let key in settings) {
				if (!(key in valid_settings) || !(valid_settings[key](settings[key]))) {
					reject({
						"status": "error",
						"what": "%server_error_validation",
					})
					return;
				}
				user_settings[uid][key] = settings[key];
			}
			resolve({
				"status": "success",
				"settings": user_settings[uid],
			});
		});
	}

	function get_login_challenge() {
		return new Promise((resolve, reject) => {
			// Create a new random challenge
			let challenge = sjcl.codec.hex.fromBits(sjcl.random.randomWords(8));

			// Remember the creation date of the challenge
			crypto_challenges[challenge] = Date.now();

			// Send the salt and the challenge to the client
			resolve({
				"status": "success",
				"salt": crypto_salt,
				"challenge": challenge
			});
		});
	}

	function post_logout(sid) {
		return new Promise((resolve, reject) => {
			_check_session(sid);
			delete sessions[sid];
			resolve({
				"status": "success",
			});
		});
	}

	function post_login(user_name, challenge, response) {
		return new Promise((resolve, reject) => {
			// Error message sent to the client in case something goes wrong
			const failure = {
				"status": "error",
				"what": "%error_invalid_username_password",
			};

			// Make sure the input values are strings
			user_name = "" + user_name;
			challenge = "" + challenge;
			response = "" + response;

			// Check whether the given challenge is valid
			if (!(challenge in crypto_challenges)) {
				resolve(failure);
				return;
			}

			// The given challenge may not be used again
			challenge_time = crypto_challenges[challenge];
			delete crypto_challenges[challenge];

			// Check whether the challenge timed out
			now = Date.now();
			if (now - challenge_time >= crypto_challenge_timeout) {
				resolve(failure);
				return;
			}

			// Get the user id for the given user_name
			const uid = _get_uid(user_name);
			if (uid === null) {
				resolve(failure);
				return;
			}

			// Compute the password hash for the given challenge and compare
			// it to the expected response
			const pbkdf2_count = 10000;
			const user = users[uid];
			const expected_response = sjcl.codec.hex.fromBits(sjcl.misc.pbkdf2(
				sjcl.codec.hex.toBits(user["password_hash"]),
				sjcl.codec.hex.toBits(challenge),
				pbkdf2_count
			));
			if (response !== expected_response) {
				resolve(failure);
				return;
			}

			// Create a new session
			const sid = sjcl.codec.hex.fromBits(sjcl.random.randomWords(8));
			sessions[sid] = uid;

			resolve({
				"status": "success",
				"session": _get_session_data(sid)
			});
		});
	}

	/**
	 * Used internally to add logging to the XHR stub, as well as to simulate
	 * connection delays.
	 */
	function _wrap_xhr_stub(obj) {
		for (let api_call in obj) {
			const old_api_call = obj[api_call];
			obj[api_call] = (...args) => {
				console.log("xhr_stub", "?", api_call, ...args);
				return new Promise((resolve, reject) => {
					window.setTimeout(() => {
						old_api_call(...args).then(data => {
							console.log("xhr_stub", "!", data)
							resolve(data);
						}).catch(data => {
							console.log("xhr_stub", "X", data);
							reject(data);
						})
					}, 100 + Math.random() * 200);
				});
			};
		}
		return obj;
	}

	return _wrap_xhr_stub({
		"get_session_data": get_session_data,
		"get_configuration": get_configuration,
		"get_user_list": get_user_list,
		"get_keyword_list": get_keyword_list,
		"get_post": get_post,
		"post_create_post": post_create_post,
		"post_update_post": post_update_post,
		"get_post_list": get_post_list,
		"get_login_challenge": get_login_challenge,
		"get_settings": get_settings,
		"post_settings": post_settings,
		"post_logout": post_logout,
		"post_login": post_login,
	});
})(this);
