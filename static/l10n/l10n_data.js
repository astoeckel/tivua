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
this.tivua.l10n_data = (function () {
	"use strict";
	return {
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
				"Lose changes?",
			"%msg_confirm":
				"You made changes that have not been saved. Are you sure you want to go back?",
			"%msg_confirm_yes":
				"Yes, lose changes",
			"%msg_confirm_no":
				"No",

			// Welcome screen
			"%header_cards_welcome":
				"Welcome to Tivua!",
			"%msg_cards_welcome":
				"There are no posts yet. Click on the \"Add entry\" button above to create one.",

			// No search results screen
			"%header_cards_no_results":
				"No results",
			"%msg_cards_no_results":
				"Your search did no match any posts.",

			// Page Titles
			"%title_login_page":
				"Tivua - Login",
			"%title_logout_page":
				"Tivua - Logout",
			"%title_list_page":
				"Tivua",
			"%title_add_page":
				"Tivua - Add Entry",
			"%title_edit_page":
				"Tivua - Edit Entry",
			"%title_users_page":
				"Tivua - Manage Users",
			"%title_preferences_page":
				"Tivua - Preferences",

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
			"%msg_cards_no_posts":
				"No posts.",
			"%msg_cards_post_count_plural":
				"Posts {start} to {end} of {total}",
			"%msg_cards_post_count_singular":
				"Post {start} of {total}",
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
			"%header_confirm_delete":
				"Delete this post?",
			"%msg_confim_delete":
				"Are you sure you really want to delete this post? This will irrecoverably delete the post and its history from Tivua.",
			"%msg_confirm_delete_yes":
				"Yes, delete",
			"%msg_confirm_delete_no":
				"No",

			// Logout dialogue
			"%logout_title":
				"Logout successful",
			"%logout_message":
				"You have been successfully logged out. You will now be redirected to the homepage.",

			// User manager
			"%lbl_users_role_inactive": "Inactive",
			"%lbl_users_role_reader": "Reader",
			"%lbl_users_role_author": "Author",
			"%lbl_users_role_admin": "Admin",

			"%header_users_role_inactive": "Inactive Users",
			"%header_users_role_reader": "Readers",
			"%header_users_role_author": "Authors",
			"%header_users_role_admin": "Administrators",
			"%header_users_new_user": "New User",

			"%lbl_users_auth_method_password": "Password",
			"%lbl_users_auth_method_cas": "CAS",
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
})();
