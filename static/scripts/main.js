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
	const view = tivua.view;
	const api = tivua.api;

	// Fetch the application root element
	const root = document.querySelector('body');

	const observer = {
		"on_login_cas":  () => {
			return new Promise((resolve, reject) => {
				window.setTimeout(() => {
					resolve();
				}, 500);
			});
		},
		"on_login_username_password": (username, password) => {
			return api.post_login(username, password).then(() => {
				_switch_view(api, root, view.cards.create);
			});
		},
	};

	/**
	 * The switch view function is used to toggle between individual views.
	 * Views implemented at the moment are the login view, the editor view and
	 * the main view.
	 */
	function _switch_view(api, root, ctor) {
		// Calls the constructor with the root element
		let construct_new_view = () => {
			root.current_view = null;
			return ctor(api, root).then(view => {
				// Listen to all view events the controller knows about
				if (view) {
					for (let key in observer) {
						if (key in view) {
							view[key] = observer[key];
						}
					}
				}

				// Remember the current view as such
				root.current_view = view;
			});
		};

		// Give the current view residing in the specified root component the
		// chance to deinitialize.
		if (root.current_view && root.current_view.deinit) {
			return root.current_view.deinit().then(construct_new_view);
		} else {
			return construct_new_view();
		}
	}

	function init() {
		// Determine whether we're currently logged in -- depending on the
		// result of this API call we'll either display the login view or the
		// main view.
		api.get_session_data()
			.then(session => {
				return _switch_view(api, root, view.cards.create);
			}).catch(() => {
				return _switch_view(api, root, view.login.create);
			}).finally(() => {
				// After we've shown the login screen for the first time, link
				// "access denied" messages to the login view
				tivua.api.on_access_denied = () => {
					_switch_view(api, root, view.login.create);
				};
			});
	}

	return {
		'init': init,
	};
})();

window.addEventListener('load', tivua.main.init);
