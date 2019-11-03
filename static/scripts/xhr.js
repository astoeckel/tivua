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
this.tivua.xhr = (function () {
	"use strict";

	/**************************************************************************
	 * XHR helper function                                                    *
	 **************************************************************************/

	function xhr_fetch_json(method, url, session, data) {
		/* Create the XHR configuration */
		const xhr = {
			"method": method,
			"headers": {},
			"credentials": "omit",
		}

		/* Add the API session as "Authorization" field to the header */
		if (session) {
			xhr.headers["Authorization"] = "Bearer " + session
		}
		if (data !== "undefined") {
			xhr.headers["Content-Type"] = "application/json";
			xhr["body"] = JSON.stringify(data)
		}

		/* Send the XHR and return the response as JSON object */
		return fetch(url, xhr).then(response => {
			return response.json();
		});
	}

	/**************************************************************************
	 * Session management                                                     *
	 **************************************************************************/

	function get_configuration() {
		return xhr_fetch_json('GET', 'api/configuration');
	}

	function get_session_data(session) {
		return xhr_fetch_json('GET', 'api/session', session);
	}

	function get_login_challenge() {
		return xhr_fetch_json('GET', 'api/session/login/challenge');
	}

	function post_logout(session) {
		return xhr_fetch_json('POST', 'api/session/logout', session);
	}

	function post_login(user_name, challenge, response) {
		return xhr_fetch_json('POST', 'api/session/login', null, {
			"user_name": user_name,
			"challenge": challenge,
			"response": response
		});
	}

	/**************************************************************************
	 * Settings                                                               *
	 **************************************************************************/

	function get_settings(session) {
		return xhr_fetch_json('GET', 'api/settings', session);
	}

	function post_settings(session, settings) {
		return xhr_fetch_json('POST', 'api/settings', session, settings);
	}

	/**************************************************************************
	 * Posts                                                                  *
	 **************************************************************************/

	function get_post_list(session, start, limit) {
		/* Make sure start, limit are integers */
		start |= 0;
		limit |= 0;

		/* Fetch the current list of posts */
		return xhr_fetch_json('GET',
			`api/posts/list?start=${start}&limit=${limit}`, session);
	}

	function get_post(session, pid) {
		/* Make sure the post id is an integer */
		pid |= 0;

		/* Fetch the post */
		return xhr_fetch_json('GET', `api/posts?pid=${pid}`, session);
	}

	/**************************************************************************
	 * Keywords                                                               *
	 **************************************************************************/

	function get_keyword_list(session, start, limit) {
		return xhr_fetch_json('GET', 'api/keywords/list', session);
	}

	/**************************************************************************
	 * Users                                                                  *
	 **************************************************************************/

	function get_user_list(session) {
		return xhr_fetch_json('GET', 'api/users/list', session);
	}

	/**************************************************************************
	 * Export the Public API                                                  *
	 **************************************************************************/

	/* Do not expose the real API in case the XHR stub is loaded. */
	if (tivua.xhr) {
		return tivua.xhr;
	} else {
		return {
			"get_session_data": get_session_data,
			"get_configuration": get_configuration,
			"get_user_list": get_user_list,
			"get_keyword_list": get_keyword_list,
			"get_post": get_post,
			"create_post": () => {throw "Not implemented";},
			"update_post": () => {throw "Not implemented";},
			"get_post_list": get_post_list,
			"get_login_challenge": get_login_challenge,
			"get_settings": get_settings,
			"post_settings": post_settings,
			"post_logout": post_logout,
			"post_login": post_login,
		};
	}
})();
