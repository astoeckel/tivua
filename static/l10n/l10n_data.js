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
			"%error_invalid_username_password":
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
				"."
		},
		"de-DE": {
			// Language metadata
			"%_language_name":
				"Deutsch",

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
				"."
		},
	}

	// Register the translations
	String.toLocaleString(l10n_data);

	// Set the default locale
	String.defaultLocale = tivua.utils.get_cookie("locale") || "en-US";
	String.locale = String.defaultLocale;

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
				nd.textContent = nd.originalTextContent.toLocaleString();
			} else if (nd.textContent.length > 0 && nd.textContent.charAt(0) == '%') {
				nd.originalTextContent = nd.textContent;
				nd.textContent = nd.textContent.toLocaleString();
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
	function set_locale(locale) {
		tivua.utils.set_cookie("locale", locale);
		String.locale = locale;
		translate_dom_tree(document.getElementsByTagName("body")[0]);
	}

	return {
		"data": l10n_data,
		"translate_dom_tree": translate_dom_tree,
		"set_locale": set_locale,
		"set_node_text": set_node_text
	};
})();
