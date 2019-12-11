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

	const HISTORY_BLACKLIST = ["logout"];

	// Map from view name onto page title
	const PAGE_TITLES = {
		"login": "%title_login_page",
		"logout": "%title_logout_page",
		"list": "%title_list_page",
		"edit": "%title_edit_page",
		"add": "%title_add_page",
		"users": "%title_users_page",
		"preferences": "%title_preferences_page",
	};

	// The observer map describes actions that are being taken whenever a view
	// issues a certain event
	const observer = {
		"on_login_cas": () => {
			return new Promise((resolve, reject) => {
				window.setTimeout(() => {
					resolve();
				}, 500);
			});
		},
		"on_login_username_password": (username, password) => {
			return api.post_login(username, password).then(() => {
				route("#list");
			});
		},
		"on_edit": (id) => {
			route(`#edit,id={id}`);
		},
		"on_add": () => {
			route("#add");
		},
		"on_back": () => {
			window.history.back();
		},
		"on_navigate": (page, posts_per_page, filter) => {
			const params = ["#list"];
			if (page > 0) {
				params.push("start=" + (page * posts_per_page));
			}
			if (filter) {
				params.push("filter=" + encodeURIComponent(filter.trim()));
			}
			route(params.join(","));
		},
	};

	/**
	 * Returns a constructor that creates a view instance for a given view with
	 * parameters.
	 */
	function _get_ctor(view_name, params) {
		if (params === null) {
			params = {};
		}
		switch (view_name) {
			case "login":
				return view.login.create;
			case "logout":
				return (api, root) => {
					return api.post_logout().then(() => {
						return view.utils.show_dialogue(root,
							"%logout_title", "%logout_message",
							[{
								"type": "delay",
								"value": 3,
								"uri": "/",
								"role": "cancel"
							}],
							true
						);
					});
				};
			case "list": {
				const start = params.start | 0;
				const filter = params.filter ? decodeURIComponent(params.filter) : "";
				return (api, root) => view.cards.create(api, root, start, filter);
			}
			case "edit":
				return (api, root) => view.editor.create(api, root, params.id);
			case "add":
				return view.editor.create;
			case "users":
				return view.user_manager.create;
			case "preferences":
				return view.preferences.create;
		}
		return null;
	}

	function _encode_fragment(view_name, params) {
		let res = "#" + encodeURIComponent(view_name);
		for (let key in params) {
			if (key != 'filter') {
				res += "," + encodeURIComponent(key) + "=" + encodeURIComponent(params[key].toString());
			} else {
				res += "," + encodeURIComponent(key) + "=" + params[key].toString();
				break;
			}
		}
		return res;
	}

	function _decode_fragment(frag) {
		// Sanity check
		if (!frag.length || frag.charAt(0) != '#') {
			return [null, null];
		}

		// Split the fragment along key-value pairs; special handling for the
		// "filter" key value pair -- assume that this is the last pair and
		// ignore additional commas.
		const frags = frag.substr(1).split(",");
		const view_name = frags[0];
		const params = {};
		for (let i = 1; i < frags.length; i++) {
			const [key, value] = frags[i].split("=", 2);
			if (key == 'filter') {
				params[key] = value;
				if (i + 1 < frags.length) {
					params[key] += "," + frags.slice(i + 1).join(",");
				}
				break;
			} else {
				params[key] = value;
			}
		}
		return [view_name, params];
	}

	/**
	 * Parses the given fragment and navigates to the corresponding view.
	 */
	function _switch_to_fragment(api, session, root, frag, add_to_history) {
		add_to_history = (add_to_history === undefined) ? false : add_to_history;
		let [view_name, params] = _decode_fragment(frag);
		if (view_name) {
			_switch_view(api, session, root, view_name, params, add_to_history)
				.catch((e) => {
					view.utils.show_error_dialogue(root, e);
				});
		}
	}

	/**
	 * The switch view function is used to toggle between individual views.
	 * Views implemented at the moment are the login view, the editor view and
	 * the main view.
	 */
	function _switch_view(api, session, root, view_name, params, add_to_history) {
		// Check whether the user must reset their password. If yes,
		// force-direct them to the preferences view
		if (session && session.reset_password &&
		    ["preferences", "logout", "login"].indexOf(view_name) == -1) {
			return _switch_view(api, session, root, "preferences", {}, false).then(
				events => {
					// Go to the originally requested location once the
					// preferences view completes
					events.on_back = () => {
						return _switch_view(api, session, root, view_name, params,
											add_to_history);
					};
					return events;
			});
		}

		// Set some parameters to default values
		params = (params === undefined) ? {} : params;
		add_to_history = (add_to_history === undefined) ? true : add_to_history;

		// If the view name is listed in the PAGE_TITLES dictionary, set it
		// accordingly
		if (view_name in PAGE_TITLES) {
			document.title = tivua.l10n.translate(PAGE_TITLES[view_name]);
		}

		// Get the constructor and add the corresponding view to the page
		const ctor = _get_ctor(view_name, params);
		if (!ctor) {
			return new Promise((_, reject) => reject({
				"status": "error",
				"what": "%err_unkown_view"
			}));
		}
		if (add_to_history && !(view_name in HISTORY_BLACKLIST)) {
			const frag = _encode_fragment(view_name, params);
			if (root.current_view/* && (old_view_name != view_name)*/) {
				window.history.pushState(null, "", frag);
			} else {
				window.history.replaceState(null, "", frag);
			}
		}

		// Calls the constructor with the root element
		let construct_new_view = () => {
			return new Promise((resolve, reject) => {
				window.setTimeout(() => {
					root.current_view = null;
					ctor(api, root).then(view => {
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

						// Return the newly constructed view
						resolve(view);
					}).catch(reject);
				}, 20);
			});
		};

		// Append the loading overlay to the given root element
		if (root.current_view) {
			view.utils.show_loading_overlay(root);
		}

		// Remove all registered event listeners
		if (root.current_view) {
			const view = root.current_view;
			for (let key in observer) {
				if (key in view) {
					view[key] = () => { return null; }
				}
			}
		}

		// Give the current view residing in the specified root component the
		// chance to deinitialize.
		if (root.current_view && root.current_view.deinit) {
			return root.current_view.deinit().then(construct_new_view);
		} else {
			return construct_new_view();
		}
	}

	/**
	 * Main router orchestrating the switch between individual views.
	 */
	function route(fragment) {
		// Either use the provided location hash or the one we're currently
		// navigating to
		fragment = fragment || window.location.hash;

		api.get_session_data()
			.then(session => {
				session = session.session; // Fetch the actual session data
				if (fragment) {
					_switch_to_fragment(api, session, root, fragment);
				} else {
					return _switch_view(api, session, root, "list", {}, true);
				}
			}).catch(() => {
				return _switch_view(api, null, root, "login");
			}).finally(() => {
				// After we've shown the login screen for the first time,
				// link "access denied" messages to the login view
				tivua.api.on_access_denied = () => {
					_switch_view(api, null, root, "login");
				};
			});
	}

	/**
	 * This is the Tivua main entry point.
	 */
	function main() {
		// Connect the "hashchange" event to the router
		window.addEventListener("hashchange", () => route());

		// Execute the router for the first time
		route();
	}

return {
		'main': main,
		'route': route,
	};
})();

window.addEventListener('load', tivua.main.main);
