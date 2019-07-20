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
		0: {
			"user_name": "demo",
			"password_hash": "2fef31c115173ef2abd946a4cbd35afe980d40ff80ea6ff66e31c37e1a4afe34",
			"full_name": "Jane Doe"
		}
	}

	/* List of active sessions */
	const sessions = {
		"default": 0 // XXX
	}

	function _check_session(session) {
		if (!(session in sessions)) {
			throw {
				"status": "error",
				"what": "%access_denied",
			};
		}
	}

	function _get_user_id(user_name) {
		for (let key in users) {
			if (users[key]["user_name"] === user_name) {
				return key | 0;
			}
		}
		return null;
	}

	challenges = {}

	function get_author_list(session) {
		return new Promise((resolve, reject) => {
			resolve({
				"status": "success",
				"authors": DATA_AUTHORS.slice()
			});
		});
	}

	function get_post_list(session, start, limit) {
		return new Promise((resolve, reject) => {
			_check_session(session);

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
				"status": "success",
				"total": DATA_CONTENT.length,
				"posts": posts
			});
		});
	}

	function get_total_post_count(session) {
		return new Promise((resolve, reject) => {
			_check_session(session);
			resolve(DATA_CONTENT.length);
		});
	}

	function _get_session_data(session) {
		const user_id = sessions[session]
		const user = users[user_id];
		return {
			"user_id": user_id,
			"user_name": user["user_name"],
			"full_name": user["full_name"],
		}
	}

	function get_session_data(session) {
		return new Promise((resolve, reject) => {
			_check_session(session);
			resolve({
				"status": "success",
				"session": _get_session_data(session),
			});
		});
	}

	function get_configuration() {
		return new Promise((resolve, reject) => {
			resolve({
				"status": "success",
				"login_methods": {
					"username_password": true,
					"cas": true
				}
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

	function post_logout(session) {
		return new Promise((resolve, reject) => {
			_check_session(session);
			delete sessions[session];
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
			const user_id = _get_user_id(user_name);
			if (user_id === null) {
				resolve(failure);
				return;
			}

			// Compute the password hash for the given challenge and compare
			// it to the expected response
			const pbkdf2_count = 10000;
			const user = users[user_id];
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
			const session = sjcl.codec.hex.fromBits(sjcl.random.randomWords(8));
			sessions[session] = user_id;

			resolve({
				"status": "success",
				"cookie": session,
				"session": _get_session_data(session)
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
					}, 20 + Math.random() * 200);
				});
			};
		}
		return obj;
	}

	return _wrap_xhr_stub({
		"get_session_data": get_session_data,
		"get_configuration": get_configuration,
		"get_author_list": get_author_list,
		"get_post_list": get_post_list,
		"get_total_post_count": get_total_post_count,
		"get_login_challenge": get_login_challenge,
		"post_logout": post_logout,
		"post_login": post_login,
	});
})(this);
