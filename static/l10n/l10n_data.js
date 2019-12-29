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
		/**********************************************************************
		 * Locale: EN-US                                                      *
		 **********************************************************************/
		"en-US": {
			/* Language metadata */
			"%_language_name": "English",

			/* Login screen */
			"%login_hdr": "Sign in",
			"%login_lbl_via_cas": "Via Central Authentication Service",
			"%login_lbl_via_cas_descr": "(for students and faculty)",
			"%login_lbl_via_username_password": "Via username and password",
			"%login_lbl_via_username_password_descr": "(for guests)",
			"%login_lbl_error": "Error",
			"%login_msg_no_login_methods":
				"No login methods have been set up and Tivua is unable to " +
				"aquire a valid user session. Please contact your administrator.",
			"%login_lbl_username": "Username",
			"%login_lbl_password": "Password",
			"%login_lbl_back": "Back",
			"%login_lbl_login": "Login",
			"%login_lbl_copyright_string_begin": "Tivua. © 2019, Andreas Stöckel. Licensed under the ",
			"%login_lbl_copyright_string_middle": ". Report bugs at ",
			"%login_lbl_copyright_string_end": ".",

			/* Search box */
			"%search_plc_filter": "Filter by author, date, or content",
			"%search_tip_clear": "Clear the currently active filter",

			/* Card view */
			"%cards_tip_add": "Add a new diary entry",
			"%cards_lbl_add": "Add entry",
			"%cards_tip_menu": "Displays the main menu",
			"%cards_tip_first": "First page",
			"%cards_tip_previous": "Previous page",
			"%cards_tip_jump": "Jump to page",
			"%cards_tip_next": "Next page",
			"%cards_tip_last": "Last page",
			"%cards_hdr_welcome": "Welcome to Tivua!",
			"%cards_msg_welcome": "There are no posts yet. Click on the \"Add entry\" button above to create one.",
			"%cards_hdr_no_results": "No results",
			"%cards_msg_no_results": "Your search did no match any posts.",
			"%cards_lbl_week_to": "\u00A0to\u00A0",
			"%cards_lbl_post_count_singular": "Post {start} of {total}",
			"%cards_lbl_post_count_plural": "Posts {start} to {end} of {total}",
			"%cards_lbl_no_posts": "Posts {start} to {end} of {total}",
			"%cards_lbl_page": "Page {}",
			"%cards_lbl_all_posts": "All posts",
			"%cards_lbl_per_page": "{} per page",
			"%cards_msg_post_history": "Last edited on {date} by {author}",

			/* Editor view */
			"%editor_tip_back": "Back to the main view",
			"%editor_hdr_new": "New entry",
			"%editor_hdr_edit": "Edit entry",
			"%editor_lbl_delete":  "Delete",
			"%editor_tip_delete": "Delete this entry",
			"%editor_lbl_create_and_save": "Create and save",
			"%editor_tip_create_and_save": "Save your changes",
			"%editor_lbl_save": "Save",
			"%editor_lbl_author": "Author",
			"%editor_lbl_date": "Date",
			"%editor_plc_date": "Today's date",
			"%editor_lbl_keywords": "Keywords",
			"%editor_lbl_content": "Content",
			"%editor_err_author": "Please select a valid author",
			"%editor_err_date_format": "YYYY-MM-DD",
			"%editor_err_keywords": "Keyword too long or too many keywords",
			"%editor_hdr_confirm_delete": "Delete this post?",
			"%editor_msg_confirm_delete": "Are you sure you really want to delete this post? This will irrecoverably delete the post and its history from Tivua.",
			"%editor_lbl_confirm_delete_yes": "Yes, delete",
			"%editor_lbl_confirm_delete_no": "No",
			"%editor_hdr_too_long": "📜 Entry is too long",
			"%editor_msg_too_long": "It looks like your entry is a little longer than the limit defined in Tivua (128KiB).\n\nYou wouldn't mind shortening it a bit, would you?",
			"%editor_hdr_conflict": "🔒 Edit conflict",
			"%editor_msg_conflict": "The entry was modified while you made your changes.\n\nPlease make a copy of your updates and apply them to the current version of the entry.",

			/* Preferences view */
			"%prefs_hdr": "Preferences",
			"%prefs_tip_back": "Back to the main view",
			"%prefs_lbl_save": "Save changes",
			"%prefs_tip_save": "Save preferences and return to the main view",
			"%prefs_hdr_reset_password": "⚠ Please enter a new password",
			"%prefs_msg_reset_password_1": "You're currently using a temporary password. Before you can continue to use Tivua, you must set a new password.",
			"%prefs_msg_reset_password_2": "Please contact your administrator should you ever forget your password.",
			"%prefs_hdr_user_details": "User details",
			"%prefs_msg_user_details": "This section shows your login name and allows you to edit your display name.",
			"%prefs_hdr_login_name": "Login name",
			"%prefs_msg_login_name": "This is the user name you use for signing into Tivua. Please contact your administrator if you would like to change your login name.",
			"%prefs_hdr_display_name": "Display name",
			"%prefs_msg_display_name": "This is how your name will be displayed to yourself and other users.",
			"%prefs_hdr_password": "Password",
			"%prefs_msg_password": "This section allows you to change your password. To change your password, type in your current password and confirm your new password twice.",
			"%prefs_hdr_current_password": "Current password",
			"%prefs_msg_current_password": "To confirm that you want to change your password, type in your current password.",
			"%prefs_hdr_new_password": "New password",
			"%prefs_msg_new_password": "Type in your new password. Your password must be at least eight characters long. It may contain arbitrary letters, digits, and symbols, but not whitespace.",
			"%prefs_lbl_password_strength": "Password strength",
			"%prefs_lbl_password_strength_none": "No password entered",
			"%prefs_lbl_password_strength_too_short": "Too short",
			"%prefs_lbl_password_strength_strong": "Strong",
			"%prefs_lbl_password_strength_good": "Good",
			"%prefs_lbl_password_strength_weak": "Weak",
			"%prefs_hdr_repeat_password": "Repeat new password",
			"%prefs_msg_repeat_password": "Repeat your new password.",
			"%prefs_tip_password_toggle": "Reveal/hide password",
			"%prefs_err_no_display_name": "Display name cannot be blank",
			"%prefs_err_display_name_too_long": "Display name too long",
			"%prefs_err_invalid_password": "Shorter than 8 characters or has whitespace",
			"%prefs_err_field_required": "This field is required",
			"%prefs_err_password_not_new": "Password must be new",
			"%prefs_err_password_not_significantly_new": "Password must be significantly different",
			"%prefs_err_passwords_do_not_match": "Passwords do not match",
			"%prefs_err_enter_current_password": "Enter your current password",
			"%prefs_err_enter_new_password": "Enter a new password",
			"%prefs_err_repeat_password": "Repeat the new password",
			"%prefs_err_password_incorrect": "Password is incorrect",

			/* User manager */
			"%users_hdr": "Manage Users",
			"%users_lbl_back": "Back to the main view",
			"%users_lbl_add": "Add user",
			"%users_tip_add": "Create a new user account",
			"%users_lbl_name": "Name",
			"%users_lbl_id": "ID",
			"%users_lbl_role": "Role",
			"%users_lbl_auth_method": "Login",
			"%users_plc_display_name": "Full name",
			"%users_plc_name": "Login name",
			"%users_tip_name_clipboard": "Copy the username to the clipboard",
			"%users_hdr_inactive": "Suspend the user account",
			"%users_lbl_inactive": "Inactive",
			"%users_hdr_reader": "Read-only access rights",
			"%users_lbl_reader": "Reader",
			"%users_hdr_author": "Normal access rights",
			"%users_lbl_author": "Author",
			"%users_hdr_admin": "Elevated access rights",
			"%users_lbl_admin": "Admin",
			"%users_hdr_password": "Use a username and password",
			"%users_lbl_password": "Password",
			"%users_hdr_cas": "Use centralised authentication",
			"%users_lbl_cas": "CAS",
			"%users_tip_reset_password": "Reset this user's password",
			"%users_tip_edit_user": "Edit this user",
			"%users_tip_delete_user": "Delete this user",
			"%users_tip_save_user": "Save the changes to this user",
			"%users_tip_discard_changes": "Discard any changes to this user",
			"%users_tip_password_clipboard": "Copy the password to the clipboard",
			"%users_tip_email": "Compose a new email containing the username and password",
			"%users_hdr_confirm_reset_password": "Confirm password reset",
			"%users_msg_confirm_reset_password": "Are you sure you want to reset the password for user \"{name}\" ({id})?\n\nThis user will no longer be able to log into Tivua until you send them the newly generated password, which will be displayed once you confirm this message.\n\nNote: This action will not end a user's active sessions. Set their role to \"Inactive\" to prevent them from accessing Tivua.",
			"%users_lbl_confirm_reset_password_yes": "Yes, reset password",
			"%users_lbl_confirm_reset_password_cancel": "Cancel",
			"%users_msg_email_subject": "New password for the Tivua instance at {url}",
			"%users_msg_email_body": "Hi {name},\n\nyour Tivua password has been reset. Find a new temporary password below. You will be prompted to set a new password the first time you log in; please do so as soon as possible.\n\nURL:      {url}\nLogin:    {user}\nPassword: {password}\n\nLet me know in case you have any questions!\n\nBest,\n{current_user}\n",
			"%users_hdr_confirm_delete_1": "⚠ Confirm user deletion",
			"%users_msg_confirm_delete_1": "Are you sure you want to delete the user \"{name}\" ({id})?\n\nThis action cannot be undone. Consider marking the user as \"Inactive\" instead.",
			"%users_hdr_confirm_delete_2": "⚠ This user contributed content",
			"%users_msg_confirm_delete_2": "The user \"{name}\" ({id}) contributed content, which will be owned by the special \"[deleted]\" user after the deletion.\n\nAre you REALLY sure you want to delete this user?\n\nThis action cannot be undone. Consider marking the user as \"Inactive\" instead.",
			"%users_lbl_confirm_delete_yes": "Yes, delete user",
			"%users_lbl_confirm_delete_cancel": "Cancel",
			"%users_hdr_users_new_user": "New user",
			"%users_hdr_users_inactive": "Inactive users",
			"%users_hdr_users_admin": "Administrators",
			"%users_hdr_users_author": "Authors",
			"%users_hdr_users_reader": "Readers",

			/* Menu */
			"%menu_tip_close": "Close this menu",
			"%menu_lbl_close": "Close this menu",
			"%menu_lbl_card_view": "Cards",
			"%menu_lbl_list_view": "List",
			"%menu_lbl_user_manager": "Manage users",
			"%menu_lbl_preferences": "Preferences",
			"%menu_lbl_help": "Help",
			"%menu_lbl_logout": "Logout",
			"%menu_lbl_close": "Close",

			/* Back button dialogue */
			"%back_hdr_confirm": "Lose changes?",
			"%back_msg_confirm": "You made changes that have not been saved. Are you sure you want to go back?",
			"%back_lbl_confirm_yes": "Yes, lose changes",
			"%back_lbl_confirm_no": "No",

			/* Server-side error messages */
			"%server_error_conflict": "Data in conflict with the current database state",
			"%server_error_invalid_display_name": "Invalid display name",
			"%server_error_invalid_keyword_len": "Invalid keyword length",
			"%server_error_invalid_name": "Invalid name",
			"%server_error_invalid_role": "Invalid role",
			"%server_error_invalid_type": "Invalid datatype",
			"%server_error_invalid_uid": "Invalid uid",
			"%server_error_no_name": "No name given",
			"%server_error_not_found": "Not found",
			"%server_error_require_author_or_cuid": "Author or creator required",
			"%server_error_require_date_or_ctime": "Date or modification time required",
			"%server_error_too_large": "HTTP body too large",
			"%server_error_too_many_keywords": "Too many keywords",
			"%server_error_unauthorized": "Invalid username/password",
			"%server_error_unknown": "Unknown server error",
			"%server_error_validation": "Valiation error",

			/* Page titles */
			"%title_login_page": "Tivua - Login",
			"%title_logout_page": "Tivua - Logout",
			"%title_list_page": "Tivua",
			"%title_add_page": "Tivua - Add Entry",
			"%title_edit_page": "Tivua - Edit Entry",
			"%title_users_page": "Tivua - Manage Users",
			"%title_preferences_page": "Tivua - Preferences",

			/* Filter expression errors */
			"%filter_err_expected_string": "Expected string token",
			"%filter_err_expected_paren_close": "Expected closing parenthesis",
			"%filter_err_unexptected_colon": "Unexpected colon",
			"%filter_err_user_not_found": "User not found",
			"%filter_err_invalid_keyword": "Invalid keyword",
			"%filter_err_invalid_date": "Invalid date",
			"%filter_err_invalid_filter_expression": "Invalid filter expression",
		},
		/**********************************************************************
		 * Locale: DE-DE                                                      *
		 **********************************************************************/
		"de-DE": {
		},
	};
})();
