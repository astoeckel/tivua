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

	function xhr_fetch_json(method, url, session) {
		return fetch(url, {
			"method": method,
			"credentials": "same-origin",
		}).then(response => {
			/* Convert the response to a JSON object */
			return response.json()
		})
	}

	function get_configuration() {
		return xhr_fetch_json('GET', 'api/configuration');
	}

	/* Do not expose the real API in case the XHR stub is loaded. */
	if (tivua.xhr) {
		return tivua.xhr;
	} else {
		return {
			"get_configuration": get_configuration,
		};
	}
})();
