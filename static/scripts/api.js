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

	// Module aliases
	const utils = tivua.utils;
	const xhr = tivua.xhr;

	/* Client side API query cache. */
	const cache = {};
	function _reset_cache() {
		cache["session_data"] = {};
		cache["settings"] = {};
	}
	_reset_cache();

	/* Default settings merged into the server response if not present. */
	const default_settings = {
		"view": "cards",
		"posts_per_page": 50,
	};

	/* Used to avoid out-of-date server responses from spoiling the settings
	   cache. */
	let settings_version = 0;

	/* Used to make sure that only the newest requested settings from the server
	   are used */
	let setings_version = 0;

	/**
	 * The internal _err function is used to promote server-side errors to
	 * client-side errors. Triggers events on certain errors, such as
	 * "on_access_denied", which redirects to the login page.
	 */
	function _err(api_promise) {
		function handle(data, resolve, reject) {
			if (data && ("status" in data) && (data["status"] === "error")) {
				if ((data["what"] === "%access_denied")) {
					utils.set_cookie("session", "");
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

	/**
	 * The get_configuration() function returns the current server
	 * configuration. This includes available login methods.
	 */
	function get_configuration() {
		return _err(xhr.get_configuration());
	}

	/**
	 * Returns a list of available authors.
	 */
	function get_author_list() {
		return _err(get_session().then(session => {
			return xhr.get_author_list(session);
		}));
	}

	/**
	 * Returns the post with the given id.
	 */
	function get_post(id) {
		return _err(get_session().then(session => {
			return xhr.get_post(session, id);
		}));
	}

	/**
	 * Returns a list of posts starting with the given date.
	 */
	function get_post_list(start, limit) {
		return _err(get_session().then(session => {
			return xhr.get_post_list(session, start, limit);
		}));
	}

	/**
	 * Returns the total number of posts.
	 */
	function get_total_post_count() {
		return _err(get_session().then(session => {
			return xhr.get_total_post_count(session);
		}));
	}

	/**************************************************************************
	 * SEARCH AND FILTERING                                                   *
	 **************************************************************************/

	/**
	 * Downloads the search index for the given trigram group.
	 */
	function get_index(initial_letter) {
		return _err(get_session().then(session => {
			return xhr.get_index(session, initial_letter);
		}));
	}

	/**************************************************************************
	 * USER SETTINGS                                                          *
	 **************************************************************************/

	function _update_settings_cache(session, authorative, version, settings) {
		/* If the response is authorative, reset the cache, otherwise use the
		   existing cache object. */
		let s_cache;
		if (authorative && (version >= settings_version)) {
			s_cache = cache.settings[session] = {};
		} else {
			s_cache = (session in cache.settings) ? cache.settings[session] : {};
		}

		/* Merge the default settings into the cache */
		for (let key in default_settings) {
			if (!(key in s_cache)) {
				s_cache[key] = default_settings[key];
			}
		}

		/* Merge the server response into the cache, ignore out-of-date
		   responses. */
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
		return _err(get_session().then(session => {
			/* If the settings are cached, use the settings stored in the
			   cache. */
			if (session in cache.settings) {
				return {
					"status": "success",
					"settings": cache.settings[session],
				};
			} else {
				/* Otherwise, actually perform a request. */
				return xhr.get_settings(session).then(
					_update_settings_cache.bind(
						this, session, true, settings_version));
			}
		}));
	}

	function post_settings(settings) {
		return _err(get_session().then(session => {
			/* Merge the requested change into the settings cache. Mark this as
			   an unauthorative update. */
			_update_settings_cache(session, false, settings_version,
					{"settings": settings});

			/* Send the updated data to the server. The server will return the
			   current settings. Merge those into the settings cache. */
			settings_version += 1;
			return xhr.post_settings(session, settings).then(
					_update_settings_cache.bind(
						this, session, true, settings_version));
		}));
	}

	/**************************************************************************
	 * SESSION MANAGEMENT                                                     *
	 **************************************************************************/

	/**
	 * The get_session() function returns a promise returning current session
	 * identifier in case a session is active, otherwise returns an empty
	 * session identifier.
	 */
	function get_session() {
		return new Promise((resolve, reject) => {
			let session = utils.get_cookie("session");
			if (session === null || session === "") {
				resolve("anonymous"); // XXX
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
		return _err(get_session().then(session => {
			if (session in cache.session_data) {
				return {
					"status": "success",
					"session": cache.session_data[session],
				};
			} else {
				return xhr.get_session_data(session).then((session_data) => {
					cache.session_data[session] = session_data.session;
					return session_data;
				});
			}
		}));
	}

	function post_logout() {
		return new Promise((resolve, reject) => {
			get_session()
				.then(session => {
					// Send the actual logout request
					return xhr.post_logout(session);
				})
				.catch(err => {
					// Do nothing here. Logging out is always successful.
				})
				.finally(() => {
					// Delete the local session cookie
					utils.set_cookie("session", "");

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
	 * Attempts a login. First logs the current user out, then retrieves a login
	 * challenge, computes the password hash and sends it to the server for
	 * verification.
	 *
	 * @param user is the user-provided username.
	 * @param password is the password entered by the user.
	 */
	function post_login(username, password) {
		return _err(post_logout().then(() => {
			return xhr.get_login_challenge();
		}).then(data => {
			return new Promise((resolve, reject) => {
				// Make sure the given salt and challenge have the right format
				const re = /^[0-9a-f]{64}$/;
				let valid = ("salt" in data) && ("challenge" in data);
				valid = valid && /^[0-9a-f]{64}$/.test(data["salt"]);
				valid = valid && re.test(data["salt"]);
				valid = valid && re.test(data["challenge"]);
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
				const pbkdf2_count = 10000;
				let response;
				response = sjcl.misc.pbkdf2(password, salt, pbkdf2_count);
				response = sjcl.misc.pbkdf2(response, challenge, pbkdf2_count);

				// Post the login attempt with the hashed password
				return _err(xhr.post_login(
					username.toLowerCase(),
					sjcl.codec.hex.fromBits(challenge),
					sjcl.codec.hex.fromBits(response)
				)).then(resolve).catch(reject);
			});
		}).then(data => {
			return new Promise((resolve, reject) => {
				// The _err call above already handled errors, so if we get
				// here, the status should be "success".
				if (data["status"] === "success") {
					utils.set_cookie("session", data["cookie"]);
					resolve(data);
				} else {
					reject({
						"status": "error",
						"what": "%invalid_server_response"
					});
				}
			});
		}));
	}


	return {
		"get_session": get_session,
		"get_session_data": get_session_data,
		"get_configuration": get_configuration,
		"get_author_list": get_author_list,
		"get_post": get_post,
		"get_post_list": get_post_list,
		"get_total_post_count": get_total_post_count,
		"get_settings": get_settings,
		"post_settings": post_settings,
		"post_logout": post_logout,
		"post_login": post_login,
		"on_access_denied": null,
	};
})(this);
