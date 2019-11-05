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
				return _switch_view(api, root, "list");
			});
		},
		"on_edit": (id) => {
			return _switch_view(api, root, "edit", {"id": id});
		},
		"on_add": () => {
			return _switch_view(api, root, "add", null);
		},
		"on_back": () => {
			window.history.back();
		},
		"on_go_to_page": (page, posts_per_page) => {
			if (page > 0) {
				switch_to_fragment("#list,start=" + (page * posts_per_page));
			} else {
				switch_to_fragment("#list");
			}
		},
	};

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
			case "list":
				return (api, root) => view.cards.create(api, root, params["start"] | 0);
			case "edit":
				return (api, root) => view.editor.create(api, root, params["id"]);
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
			res += "," + encodeURIComponent(key) + "=" + encodeURIComponent(params[key].toString());
		}
		return res;
	}

	function _decode_fragment(frag) {
		// Sanity check
		if (!frag.length || frag.charAt(0) != '#') {
			return [null, null];
		}

		// Split the fragment along key-value pairs
		const frags = frag.substr(1).split(",");
		const view_name = frags[0];
		const params = {}
		for (let i = 1; i < frags.length; i++) {
			const [key, value] = frags[i].split("=", 2);
			params[key] = value;
		}
		return [view_name, params];
	}

	function _switch_to_fragment(api, root, frag, add_to_history) {
		add_to_history = (add_to_history === undefined) ? false : add_to_history;
		let [view_name, params] = _decode_fragment(frag);
		if (view_name) {
			_switch_view(api, root, view_name, params, add_to_history).catch(e => {
				tivua.view.utils.show_error_dialogue(root, e);
				const msg = e.what ? e.what : e.toString();
			});
		}
	}

	/**
	 * The switch view function is used to toggle between individual views.
	 * Views implemented at the moment are the login view, the editor view and
	 * the main view.
	 */
	function _switch_view(api, root, view_name, params, add_to_history) {
		params = (params === undefined) ? {} : params;
		add_to_history = (add_to_history === undefined) ? true : add_to_history;

		// Get the constructor and add the corresponding view to the page
		const ctor = _get_ctor(view_name, params);
		if (!ctor) {
			return new Promise((_, reject) => reject({
				"status": "error",
				"what": "%err_unkown_view"
			}));
		}
		if (add_to_history && !(view_name in HISTORY_BLACKLIST)) {
			/*const [old_view_name, _] = _decode_fragment(window.location.hash);*/
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
					}).then(resolve).catch(reject)
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
					view[key] = () => {return null;}
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

	function init() {
		// Register the "hashchange" envent
		window.addEventListener("hashchange", function () {
			_switch_to_fragment(api, root, window.location.hash);
		});

		// Determine whether we're currently logged in -- depending on the
		// result of this API call we'll either display the login view or the
		// main view.
		api.get_session_data()
			.then(session => {
				if (window.location.hash) {
					_switch_to_fragment(api, root, window.location.hash);
				} else {
					return _switch_view(api, root, "list");
				}
			}).catch(() => {
				return _switch_view(api, root, "login");
			}).finally(() => {
				// After we've shown the login screen for the first time, link
				// "access denied" messages to the login view
				tivua.api.on_access_denied = () => {
					_switch_view(api, root, "login");
				};
			});
	}

	function switch_to_fragment(fragment) {
		_switch_to_fragment(api, root, fragment, true);
	}

	return {
		'init': init,
		'switch_to_fragment': switch_to_fragment,
	};
})();

window.addEventListener('load', tivua.main.init);
