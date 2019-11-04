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
this.tivua.l10n = (function () {
	"use strict";

	const l10n_data = {
		"en-US": {
			// Language metadata
			"%_language_name":
				"English",

			// Generic error messages
			"%access_denied":
				"Access denied",
			"%post_not_found":
				"The requested post could not be found.",
			"%err_unkown_view":
				"The requested view does not exist.",

			// Error dialogue
			"%header_error":
				"Whooops, something went wrong... 🙈",
			"%lbl_msg_generic":
				"An unexpected error occured. Most likely this was caused by a programming error inside of Tivua and, unfortunately, there is little you can do to fix this problem. Please contact the developers if this problem persists. Make sure to include all of the information displayed below in your bug report.",
			"%lbl_stack_trace":
				"Stack trace:",
			"%lbl_msg_more_information":
				"More information:",
			"%btn_home":
				"Back to the homepage",

			// Confirmation dialogue
			"%header_confirm":
				"Go back and lose changes?",
			"%msg_confirm":
				"You made changes that have not been saved. Are you sure you want to go back?",
			"%msg_confirm_yes":
				"Yes, lose changes",
			"%msg_confirm_no":
				"No",

			// Welcome screen
			"%header_welcome":
				"Welcome to Tivua!",
			"%msg_welcome":
				"There are no posts yet. Click on the \"Add entry\" button above to create one.",

			// Menu
			"%tooltip_menu":
				"Displays the main menu",
			"%lbl_card_view":
				"Cards",
			"%lbl_list_view":
				"List",
			"%lbl_menu_user_manager":
				"Manage users",
			"%lbl_menu_preferences":
				"Preferences",
			"%lbl_menu_help":
				"Help",
			"%lbl_menu_logout":
				"Logout",
			"%lbl_menu_close":
				"Close this menu",

			// Login form
			"%sign_in":
				"Sign in",
			"%via_cas":
				"Via Central Authentication Service",
			"%via_cas_descr":
				"(for students and faculty)",
			"%via_username_password":
				"Via username and password",
			"%via_username_password_descr":
				"(for guests)",
			"%error":
				"Error",
			"%error_msg_no_login_methods":
				"No login methods have been set up and Tivua is unable to " +
				"aquire a valid user session. Please contact your administrator.",
			"%error_msg_enter_username":
				"Please enter a username",
			"%error_msg_enter_password":
				"Please enter a password",
			"%server_error_authentification":
				"Invalid username or password",
			"%username":
				"Username",
			"%password":
				"Password",
			"%login":
				"Login",
			"%back":
				"Back",
			"%copyright_string_begin":
				"Tivua. © 2019, Andreas Stöckel. Licensed under the ",
			"%copyright_string_middle":
				". Report bugs at ",
			"%copyright_string_end":
				".",

			// Card view
			"%msg_no_posts":
				"No posts.",
			"%msg_post_history":
				"Last edited on %date by %author",

			// Editor view
			"%header_new_entry":
				"New entry",
			"%header_edit_entry":
				"Edit entry",
			"%btn_delete":
				"Delete",
			"%btn_create_and_save":
				"Create and save",
			"%btn_save":
				"Save",
			"%lbl_author":
				"Author",
			"%lbl_date":
				"Date",
			"%lbl_keywords":
				"Keywords",
			"%lbl_content":
				"Content",
			"%placeholder_name":
				"Your name",
			"%placeholder_date":
				"Today's date",
			"%placeholder_keywords":
				"Keywords",
			"%err_date_format":
				"YYYY-MM-DD",
			"%err_author":
				"Please select a valid author",
			"%err_keywords":
				"Keyword too long or too many keywords",

			// Logout dialogue
			"%logout_title":
				"Logout successful",
			"%logout_message":
				"You have been successfully logged out. You will now be redirected to the homepage.",
		},
		"de-DE": {
			// Language metadata
			"%_language_name":
				"Deutsch",

			// Generic error messages
			"%access_denied":
				"Zugriff verweigert",
			"%post_not_found":
				"Der angefragte Beitrag konnte nicht gefunden werden.",

			// Login form
			"%sign_in":
				"Anmeldung",
			"%via_cas":
				"Mittels zentralem Authentifizierungsdienst",
			"%via_cas_descr":
				"(für Studenten und Mitarbeiter)",
			"%via_username_password":
				"Mittels Benutzername und Passwort",
			"%via_username_password_descr":
				"(für Gäste)",
			"%error":
				"Fehler",
			"%error_msg_no_login_methods":
				"Es wurden kein Anmeldemethoden eingerichtet und Tivua ist " +
				"nicht in der Lage eine gültige Benutzersitzung zu erhalten. " +
				"Bitte kontaktieren Sie Ihren Administrator.",
			"%error_msg_enter_username":
				"Bitte geben Sie einen Benutzernamen ein",
			"%error_msg_enter_password":
				"Bitte geben Sie ein Passwort ein",
			"%error_invalid_username_password":
				"Ungültiger Benutzer oder Passwort",
			"%username":
				"Benutzer",
			"%password":
				"Passwort",
			"%login":
				"Anmelden",
			"%back":
				"Zurück",
			"%copyright_string_begin":
				"Tivua. © 2019, Andreas Stöckel. Lizensiert unter der ",
			"%copyright_string_middle":
				". Bitte berichten Sie Fehler unter ",
			"%copyright_string_end":
				".",

			// Logout dialogue
			"%logout_title":
				"Abmelden erfolgreich",
			"%logout_message":
				"Sie wurden erfolgreich abgemeldet. Sie werden nun auf die Startseite weitergeleitet.",
		},
	}

	let locale = {
		"default_locale": tivua.utils.get_cookie("locale") || "en-US",
		"current_locale": tivua.utils.get_cookie("locale") || "en-US",
		"fallback_locale": "en-US"
	};

	function translate(str) {
		let dict = l10n_data[locale.fallback_locale];
		let fallback_dict = dict;
		if (locale.current_locale in l10n_data) {
			dict = l10n_data[locale.current_locale];
		}
		if (dict && str in dict) {
			return dict[str];
		}
		if (fallback_dict && str in fallback_dict) {
			return fallback_dict[str];
		}
		return str.toLocaleString();
	}

	/**
	 * Function used to translate a DOM tree. Attatches the
	 * "originalTextContent" to all nodes that have been translated. This allows
	 * translate_dom_tree() to translate the same DOM tree multiple times.
	 */
	function translate_dom_tree(nd, ignore_original_text=false)
	{
		// Translate or attribute value nodes
		if (nd.nodeType == nd.TEXT_NODE || nd.nodeType == nd.ATTRIBUTE_NODE) {
			if (nd.originalTextContent && ignore_original_text) {
				nd.originalTextContent = null;
			}
			if (nd.originalTextContent) {
				nd.textContent = translate(nd.originalTextContent)
			} else if (nd.textContent.length > 0 && nd.textContent.charAt(0) == '%') {
				nd.originalTextContent = nd.textContent;
				nd.textContent = translate(nd.textContent)
			}
		}

		// Iterate over all attributes
		if (nd.attributes) {
			for (let attribute of nd.attributes) {
				translate_dom_tree(attribute, ignore_original_text);
			}
		}

		// Iterate over all children
		if (nd.childNodes) {
			for (let child of nd.childNodes) {
				translate_dom_tree(child, ignore_original_text);
			}
		}
	}

	function set_node_text(nd, text) {
		nd.innerText = text;
		translate_dom_tree(nd, true);
	}

	// Sets the locale to the given locale and re-translates the current
	// document body.
	function set_locale(locale_name) {
		tivua.utils.set_cookie("locale", locale_name);
		locale.current_locale = locale_name;
		translate_dom_tree(document.getElementsByTagName("body")[0]);
	}

	function get_locale() {
		return locale.current_locale;
	}

	return {
		"data": l10n_data,
		"translate": translate,
		"translate_dom_tree": translate_dom_tree,
		"set_locale": set_locale,
		"get_locale": get_locale,
		"set_node_text": set_node_text
	};
})();
