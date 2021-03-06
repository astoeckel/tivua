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
 * @file api.js
 *
 * This file defines the "tivua.api" module. The API module is an abstraction
 * layer over the raw XHR requests sent to the server. For example, the API
 * module automatically handles the currently active session, hashes passwords,
 * and normalises the given input data.
 *
 * @author Andreas Stöckel
 */

this.tivua = this.tivua || {};
this.tivua.api = (function (window) {
	"use strict";

	const PBKDF2_COUNT = 10000;

	// Module aliases
	const utils = tivua.utils;
	const xhr = tivua.xhr;

	/* Client side API query cache. */
	const cache = {};
	function _reset_cache() {
		cache["keywords"] = {};
		cache["users"] = {};
		cache["session_data"] = {};
		cache["settings"] = {};
		cache["configuration"] = {};
	}
	_reset_cache();

	/* Default settings merged into the server response if not present. */
	const default_settings = {
		"view": "cards",
		"posts_per_page": 50,
	};

	/* Time until the session cookie expires in days. This is a fairly large
	   value because the server checks the validity of the session
	   independently. */
	let session_timeout_days = 730; // This is approximately what Google uses

	/* Used to avoid out-of-date server responses from spoiling the settings
	   cache. */
	let settings_version = 0;

	/**
	 * The internal _err function is used to promote server-side errors to
	 * client-side errors. Triggers events on certain errors, such as
	 * "on_access_denied", which redirects to the login page.
	 */
	function _err(api_promise) {
		function handle(data, resolve, reject) {
			if (data && ("status" in data) && (data["status"] === "error")) {
				if ((data["what"] === "%server_error_unauthorized")) {
					if (tivua.api.on_access_denied) {
						tivua.api.on_access_denied();
					}
				}
				reject(data);
			} else {
				resolve(data);
			}
		}

		return new Promise((resolve, reject) => {
			api_promise
				.then(data => handle(data, resolve, reject))
				.catch(err => handle(err, reject, reject));
		});
	}

	function _cached(sid, key, callback) {
		/* Check whether the data is already in the cache */
		if (sid in cache[key]) {
			let res = {};
			res["status"] = "success";
			res[key] = cache[key][sid];
			return res;
		}
		return _err(callback()).then((data) => {
			cache[key][sid] = data[key];
			return data;
		});
	}

	/**
	 * The get_configuration() function returns the current server
	 * configuration. This includes available login methods.
	 */
	function get_configuration() {
		return _err(new Promise((resolve) => resolve()).then(() => {
			return _cached("<no_session>", "configuration",
				xhr.get_configuration);
		}));
	}

	/**
	 * Returns a list of available users.
	 */
	function get_user_list() {
		return _err(get_sid().then(sid => {
			return _cached(sid, "users", () => xhr.get_user_list(sid));
		}));
	}

	/**
	 * Returns a list of keywords used so far.
	 */
	function get_keyword_list() {
		return _err(get_sid().then(sid => {
			return _cached(sid, "keywords", () => xhr.get_keyword_list(sid));
		}));
	}

	/**
	 * Returns the post with the given id.
	 */
	function get_post(id) {
		return _err(get_sid().then(sid => {
			return xhr.get_post(sid, id);
		}));
	}

	/**
	 * Writes new keywords found in the given post to the keyword cache.
	 */
	function _update_keyword_cache(sid, post) {
		/* Do nothing if the cache has not been initialized */
		if (!(sid in cache["keywords"])) {
			return;
		}

		/* Update the local keyword cache */
		let _cache = cache["keywords"][sid];
		for (let keyword of (post["keywords"] || [])) {
			if (typeof keyword !== "string") {
				continue;
			}
			keyword = keyword.trim().toLowerCase();
			if (keyword && !(keyword in _cache)) {
				_cache[keyword] = 1;
			}
		}
	}

	/**
	 * Make sure stuff in the "post" structure has the right type.
	 */
	function _canonicalise_post(post) {
		let canonical_post = {};
		for (let key in post) {
			if (key == "author" || key == "date" || key == "revision") {
				canonical_post[key] = Math.trunc(post[key]);
			} else {
				canonical_post[key] = post[key];
			}
		}
		return canonical_post;
	}

	/**
	 * Creates a new post with the given author, date, keywords, and content.
	 * The server response will be the same as a "get_post" on the newly created
	 * post.
	 *
	 * @param post is a JSON serialisable object containing at least the
	 * following keys: "author", "content" and "date". In particular:
	 *     - "author" is the numerical author id.
	 *     - "date" is the date should be stored under as a numerical Unix
	 *       timestamp.
	 *     - "content" is a string containing the markdown-encoded contents of
	 *       the post.
	 *     - "keywords" (optional) is a comma separated list of keywords.
	 */
	function create_post(post) {
		return _err(get_sid().then(sid => {
			_update_keyword_cache(sid, post);
			return xhr.post_create_post(sid, _canonicalise_post(post));
		}));
	}

	/**
	 * Updates an already existing post. On success, the server response will be
	 * the same as a "get_post" on the updated post. If the update was not
	 * successful because of an edit conflict, the current revision stored on
	 * the server will be returned in the error.
	 *
	 * @param id is the ID of the post that should be updated.
	 * @param post is a "post" object, similar to the "post" object passed to
	 * create_post. However, in addition, the following fields are required
	 *     - "revision" is the revision of the post this updated is based on.
	 *       This field will be incremented by one after the update is complete.
	 */
	function update_post(id, post) {
		return _err(get_sid().then(sid => {
			_update_keyword_cache(sid, post);
			return xhr.post_update_post(sid, id | 0, _canonicalise_post(post));
		}));
	}

	/**
	 * Deletes the post with the given pid.
	 */
	function delete_post(pid) {
		return _err(get_sid().then(sid => {
			return xhr.post_delete_post(sid, pid | 0);
		}));
	}

	/**
	 * Returns a list of posts starting with the given date.
	 */
	function get_post_list(start, limit, filter) {
		filter = filter ? JSON.stringify(filter) : null;
		return _err(get_sid().then(sid => {
			return xhr.get_post_list(sid, start | 0, limit | 0, filter);
		}));
	}

	/**************************************************************************
	 * USER SETTINGS                                                          *
	 **************************************************************************/

	function _update_settings_cache(sid, authorative, version, settings) {
		// If the response is authorative, reset the cache, otherwise use the
		// existing cache object.
		let s_cache;
		if (authorative && (version >= settings_version)) {
			s_cache = cache.settings[sid] = {};
		} else {
			s_cache = (sid in cache.settings) ? cache.settings[sid] : {};
		}

		// Merge the default settings into the cache
		for (let key in default_settings) {
			if (!(key in s_cache)) {
				s_cache[key] = default_settings[key];
			}
		}

		// Merge the server response into the cache, ignore out-of-date
		// responses.
		let s_resp = settings.settings;
		if (version >= settings_version) {
			for (let key in s_resp) {
				s_cache[key] = s_resp[key];
			}
		}

		return {
			"status": "success",
			"settings": s_cache,
		};
	}

	function get_settings() {
		return _err(get_sid().then(sid => {
			// If the settings are cached, use the settings stored in the
			// cache.
			if (sid in cache.settings) {
				return {
					"status": "success",
					"settings": cache.settings[sid],
				};
			} else {
				// Otherwise, actually perform a request.
				return _err(xhr.get_settings(sid)).then(
					_update_settings_cache.bind(
						this, sid, true, settings_version));
			}
		}));
	}

	function post_settings(settings) {
		return _err(get_sid().then(sid => {
			// Merge the requested change into the settings cache. Mark this as
			// an unauthorative update.
			_update_settings_cache(sid, false, settings_version,
					{"settings": settings});

			// Send the updated data to the server. The server will return the
			// current settings. Merge those into the settings cache.
			settings_version += 1;
			return _err(xhr.post_settings(sid, settings)).then(
					_update_settings_cache.bind(
						this, sid, true, settings_version));
		}));
	}

	function _update_user_cache(sid, data) {
		// Update the session data cache if the current user was updated
		if (sid in cache.session_data) {
			const user = data.user;
			const session = cache.session_data[sid];
			if (cache.session_data[sid].uid === user.uid) {
				for (let key in user) {
					if (key in session) {
						session[key] = user[key];
					}
				}
			}
		}

		// Update data in the users list
		if (sid in cache.users) {
			const user = data.user;
			const user_list = cache.users[sid];
			if (user.uid in user_list) {
				const user_list_user = user_list[user.uid];
				for (let key in user) {
					if (key in user_list_user) {
						user_list_user[key] = user[key];
					}
				}
			} else {
				user_list[user.uid] = user;
			}
		}

		return data;
	}

	function update_user(settings) {
		return _err(get_sid().then(sid => {
			return _err(xhr.update_user(sid, settings)).then((data) =>
				_update_user_cache(sid, data));
		}));
	}

	function create_user(settings) {
		return _err(get_sid().then(sid => {
			return _err(xhr.create_user(sid, settings)).then((data) =>
				_update_user_cache(sid, data));
		}));
	}

	function delete_user(uid, force) {
		return _err(get_sid().then(sid => {
			return _err(xhr.delete_user(sid, uid, force)).then((data) => {
				if (data.confirmed) {
					if (sid in cache.users && uid in cache.users[sid]) {
						delete cache.users[sid][uid];
					}
				}
				return data;
			});
		}));
	}

	/**************************************************************************
	 * USER SETTINGS                                                          *
	 **************************************************************************/

	function reset_password(uid) {
		return _err(get_sid().then(sid => {
			return xhr.reset_password(sid, uid | 0);
		}));
	}


	/**************************************************************************
	 * SESSION MANAGEMENT                                                     *
	 **************************************************************************/

	/**
	 * The get_sid() function returns a promise returning current session
	 * identifier in case a session is active, otherwise returns an empty
	 * session identifier.
	 */
	function get_sid() {
		return new Promise((resolve, reject) => {
			let session = utils.get_cookie("sid");
			if (session === null || session === "") {
				reject({"status": "error", "what": "No active session"});
			} else {
				resolve(session);
			}
		});
	}

	/**
	 * The get_session_data() function queries the server for the data
	 * associated with the current session.
	 */
	function get_session_data() {
		return _err(get_sid().then(sid => {
			if (sid in cache.session_data) {
				return {
					"status": "success",
					"session": cache.session_data[sid],
				};
			} else {
				return _err(xhr.get_session_data(sid)).then((session_data) => {
					cache.session_data[sid] = session_data.session;
					return session_data;
				});
			}
		}));
	}

	function post_logout() {
		return new Promise((resolve, reject) => {
			get_sid()
				.then(sid => {
					// Send the actual logout request
					return xhr.post_logout(sid);
				})
				.catch(err => {
					// Do nothing here. Logging out is always successful.
				})
				.finally(() => {
					// Delete the local session cookie
					utils.set_cookie("sid", "");

					// Reset the cache
					_reset_cache();

					// Inform the calling code that logging out was successful
					resolve({
						"status": "success"
					});
				});
		});
	}

	/**
	 * Fetches the password salt from the server and hashes the given password.
	 */
	function encrypt_password(password) {
		return _err(get_configuration().then(data => {
			const salt = sjcl.codec.hex.toBits(data.configuration.salt);
			const hashed = sjcl.misc.pbkdf2(password, salt, PBKDF2_COUNT);
			return {
				"status": "success",
				"password": sjcl.codec.hex.fromBits(hashed)
			};
		}));
	}

	function _post_login_internal(username, password) {
		return xhr.get_login_challenge().then(data => {
			return new Promise((resolve, reject) => {
				// Make sure the given salt and challenge have the right format
				const re = /^[0-9a-f]{64}$/;
				let valid = ("salt" in data) && ("challenge" in data);
				valid = valid && re.test(data.salt);
				valid = valid && re.test(data.challenge);
				if (!valid) {
					reject({
						"status": "error",
						"what": "%invalid_server_response"
					});
					return;
				}

				// Convert the given salt and challenge to a bit sequence
				const salt = sjcl.codec.hex.toBits(data["salt"]);
				const challenge = sjcl.codec.hex.toBits(data["challenge"]);

				// Hash the password with the salt and the challenge
				let response;
				response = sjcl.misc.pbkdf2(password, salt, PBKDF2_COUNT);
				response = sjcl.misc.pbkdf2(response, challenge, PBKDF2_COUNT);

				// Post the login attempt with the hashed password
				return _err(xhr.post_login(
					username.toLowerCase(),
					sjcl.codec.hex.fromBits(challenge),
					sjcl.codec.hex.fromBits(response)
				)).then(resolve).catch(reject);
			});
		});
	}

	/**
	 * Checks whether the given password is correct by opening and closing a
	 * temporary session.
	 */
	function check_password(username, password) {
		// Backup the OAC handler, an "access denied" error here should
		// not result in the login dialogue to popup
		const oac_handler = tivua.api.on_access_denied;
		tivua.api.on_access_denied = null;

		// Try to login using the given username/password combination. On
		// success, this will create a new session which we close immediately.
		return new Promise((resolve, reject) => {
			_post_login_internal(username, password).then(data => {
				return xhr.post_logout(data.session.sid).then(() => {
					resolve(true);
				});
			}).catch(err => {
				// If the error is "unauthorized", we know that the given
				// password is not correct
				if (err && err.what === "%server_error_unauthorized") {
					resolve(false);
				}
				reject(err);
			}).finally(() => {
				// Restore the OAC handler
				tivua.api.on_access_denied = oac_handler;
			});
		});
	}

	/**
	 * Attempts a login. First logs the current user out, then retrieves a login
	 * challenge, computes the password hash and sends it to the server for
	 * verification.
	 *
	 * @param user is the user-provided username.
	 * @param password is the password entered by the user.
	 */
	function post_login(username, password) {
		// Backup the OAC handler, an "access denied" error here should
		// not result in the login dialogue to popup, we already are in
		// the login dialogue
		const oac_handler = tivua.api.on_access_denied;
		tivua.api.on_access_denied = null;

		return _err(post_logout().then(() => {
			return _post_login_internal(username, password).then(data => {
				return new Promise((resolve, reject) => {
					// The _err call in _post_login_internal already handled
					// errors, so if we get here, the status should be
					// "success".
					if (data["status"] === "success") {
						const sid = data["session"]["sid"];
						cache["session_data"][sid] = data["session"];
						utils.set_cookie("sid", data["session"]["sid"],
										 session_timeout_days);
						resolve(data);
					} else {
						reject({
							"status": "error",
							"what": "%invalid_server_response"
						});
					}
				});
			});
		})).finally(() => {
			// Restore the OAC handler
			tivua.api.on_access_denied = oac_handler;
		});
	}

	/**************************************************************************
	 * PERMISSION HELPER FUNCTIONS                                            *
	 **************************************************************************/

	function _get_perms(obj) {
		const permission_map = {
			"admin": [1, 1, 1],
			"author": [1, 1, 0],
			"reader": [1, 0, 0],
			"inactive": [0, 0, 0],
		};

		if ("role" in obj) {
			obj = obj.role;
		}

		if (obj in permission_map) {
			return permission_map[obj];
		}

		return permission_map.inactive;
	}

	function can_read(session_or_role) {
		return !!_get_perms(session_or_role)[0];
	}

	function can_write(session_or_role) {
		return !!_get_perms(session_or_role)[1];
	}

	function can_admin(session_or_role) {
		return !!_get_perms(session_or_role)[2];
	}

	return {
		"get_sid": get_sid,
		"get_session_data": get_session_data,
		"get_configuration": get_configuration,
		"get_user_list": get_user_list,
		"get_keyword_list": get_keyword_list,
		"get_post": get_post,
		"update_post": update_post,
		"create_post": create_post,
		"delete_post": delete_post,
		"get_post_list": get_post_list,
		"get_settings": get_settings,
		"post_settings": post_settings,
		"reset_password": reset_password,
		"post_logout": post_logout,
		"post_login": post_login,
		"check_password": check_password,
		"encrypt_password": encrypt_password,
		"update_user": update_user,
		"create_user": create_user,
		"delete_user": delete_user,
		"on_access_denied": null,
		"can_read": can_read,
		"can_write": can_write,
		"can_admin": can_admin,
	};
})(this);
