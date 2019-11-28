#!/usr/bin/env python3

#   Tivua -- Shared research blog
#   Copyright (C) 2019  Andreas Stöckel
#
#   This program is free software: you can redistribute it and/or modify
#   it under the terms of the GNU Affero General Public License as
#   published by the Free Software Foundation, either version 3 of the
#   License, or (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU Affero General Public License for more details.
#
#   You should have received a copy of the GNU Affero General Public License
#   along with this program.  If not, see <https://www.gnu.org/licenses/>.

################################################################################
# LOGGER                                                                       #
################################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# COMMAND LINE ARGUMENTS                                                       #
################################################################################

import argparse

def check_port_number(i):
    i = int(i)
    if (i <= 0) or (i > 65535):
        raise argparse.ArgumentTypeError("Invalid port number")
    return i

def create_parser():
    # Helper function used to read default values from the environment
    def _env_or_default(var, default, conv=lambda x: x):
        import os
        if var in os.environ:
            try:
                return conv(os.environ[var])
            except ValueError:
                logger.warning('Environment variable \"{}\" set, but invalid value given'.format(var))
                return default
        else:
            return default

    # Read default arguments from the environment
    DEFAULT_DB = _env_or_default('TIVUA_DB', './tivua.sqlite')
    DEFAULT_PORT = _env_or_default('TIVUA_PORT', 9368, int)
    DEFAULT_BIND = _env_or_default('TIVUA_BIND', '127.0.0.1')
    DEFAULT_DOCUMENT_ROOT = _env_or_default('TIVUA_DOCUMENT_ROOT', './static/')

    # Create a subparser for each individual command
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    subs = parser.add_subparsers()
    subs.dest = 'command'
    subs.required = True

    # Creates a new parser and adds shared options
    def _mkp(parent, command, help):
        p = parent.add_parser(
            command,
            help=help,
            formatter_class=argparse.ArgumentDefaultsHelpFormatter)
        p.add_argument(
            '--db',
            help='Location of the database file',
            type=str,
            default=DEFAULT_DB)
        p.add_argument(
            '--verbose',
            help='Print debug log messages',
            action='store_true')
        return p

    # "serve" command
    p_serve = _mkp(subs, 'serve', 'Run the Tivua application server')
    p_serve.add_argument(
        '--port',
        help='Port number',
        type=check_port_number,
        default=DEFAULT_PORT)
    p_serve.add_argument(
        '--bind',
        help='Address of the interface the server should bind to',
        type=str,
        default=DEFAULT_BIND)
    p_serve.add_argument(
        '--no-dev',
        help='Disable serving debug versions of the frontend',
        action='store_true')
    p_serve.add_argument(
        '--document-root',
        help='Sets the web root directory',
        type=str,
        default=DEFAULT_DOCUMENT_ROOT)

    # "import" command
    p_import = _mkp(subs, 'import', 'Restores a previous JSON database export')
    p_import.add_argument(
        'file',
        help=
        'The backup file to import from. The value \'-\' reads the dump to stdin',
        type=str,
        default='-',
        nargs='?')

    # "export" command
    p_export = _mkp(subs, 'export', 'Exports the database to a JSON file')
    p_export.add_argument(
        'file',
        help=
        'The backup file to export to. The value \'-\' writes the dump to stdout',
        type=str,
        default='-',
        nargs='?')
    p_export.add_argument(
        '--no-export-passwords',
        help='If set, does not store passwords in the exported file',
        action='store_true')

    # "user" commands
    p_user = _mkp(subs, 'user', 'Manage Tivua users from the command line')
    subs_user = p_user.add_subparsers()
    subs_user.dest = 'user_command'
    subs_user.required = True

    # "user add" command
    p_user_add = _mkp(subs_user, 'add', 'Adds a new user')
    p_user_add.add_argument(
        'name',
        help='The login name of the new user')
    p_user_add.add_argument(
        '--role',
        help='Access rights of the new user',
        default='author',
        choices=['inactive', 'reader', 'author', 'admin'],
    )
    p_user_add.add_argument(
        '--display-name',
        help='The new user\'s full name',
        default=''
    )

    # "user delete" command
    p_user_delete = _mkp(subs_user, 'delete', 'Deletes an existing user')
    p_user_delete.add_argument(
        'name', help='The name of the user that should be deleted', type=str)
    p_user_delete.add_argument(
        '--force',
        help='Forces the deletion of a user who already has posts.',
        action='store_true')

    # "user reset_password" command
    p_user_reset_password = _mkp(subs_user, 'reset-password', 'Resets the password of the specified user and generates a new one')
    p_user_reset_password.add_argument(
        'name',
        help='The name of the user who\'s password should be reset',
        type=str)

    # "user set-role" command
    p_user_set_role = _mkp(subs_user, 'set-role', 'Resets the password of the specified user and generates a new one')
    p_user_set_role.add_argument(
        'name',
        help='The name of the user who\'s role should be set',
        type=str)
    p_user_set_role.add_argument(
        'role',
        help='',
        choices=['inactive', 'reader', 'author', 'admin'],
    )

    # "config" command
    p_config = _mkp(subs, 'config', 'Manages configuration strings')
    subs_config = p_config.add_subparsers()
    subs_config.dest = 'config_command'
    subs_config.required = True

    # "config list" command
    p_config_list = _mkp(subs_config, 'list', 'Lists all configuration option and their value')
    

    # "config get" command
    p_config_get = _mkp(subs_config, 'get', 'Prints the given option')
    p_config_get.add_argument(
        'option',
        help='The option to print')
    
    # "config set" command
    p_config_set = _mkp(subs_config, 'set', 'Sets the option to a specific value')
    p_config_set.add_argument(
        'option',
        help='The option to set')
    p_config_set.add_argument(
        'value',
        help='The option to set')

    return parser


################################################################################
# MAIN PROGRAM                                                                 #
################################################################################


def _init(args, perform_initialisation=False):
    """
    Helper function that parses the arguments shared by all Tivua sub-programs.
    """
    import tivua.database
    import tivua.api

    # Increase the verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Open the database
    db = tivua.database.Database(args.db)

    # Create the api object and connect it to the database
    api = tivua.api.API(db, perform_initialisation)

    return api


def main_serve(args):
    import tivua.server
    import tivua.api

    # Make sure TCP servers can quickly reuse the port after the application
    # exits
    import socketserver
    socketserver.TCPServer.allow_reuse_address = True

    # Initialise the API and parse default parameters
    api = _init(args, perform_initialisation=True)

    # Open the database connection
    with api:
        # Start the HTTP server
        Server = tivua.server.create_server_class(api, args)
        with socketserver.TCPServer((args.bind, args.port), Server) as httpd:
            logger.info("Serving on http://{}:{}/".format(
                args.bind, args.port))
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                pass

    return 0


def main_import(args):
    import time, sys, json, datetime

    # Parse the command line arguments
    api = _init(args)

    # Open the source file
    if args.file == '-':
        file = sys.stdin
        must_close_file = False
    else:
        file = open(args.file, 'r')
        must_close_file = True

    try:
        # Open the database
        with api:
            # Deserialise the provided JSON file
            obj = json.load(file)

            # Create a backup of the database
            backup_filename = '.tivua_backup_{date:%Y-%m-%d_%H_%M_%S}.json'.format(
                date=datetime.datetime.now())
            logger.warning(
                'Writing database backup to \"{}\"'.format(backup_filename))
            with open(backup_filename, 'w') as backup_file:
                json.dump(api.export_to_object(), backup_file, indent=4)
                backup_file.write("\n")

            try:
                logger.info('Purging the database and importing data...')
                api.import_from_object(obj)
                logger.info('Done!')
            except:
                logger.exception(
                    'There was an error while importing the data, the database should have been rolled back to its original state.'
                )
    finally:
        # Make sure to close the input file
        if must_close_file:
            file.close()

    return 0


def main_user(args):
    """
    Contains the "user" sub-programs.
    """
    import tivua.api

    api = _init(args)
    cmd, name = args.user_command, args.name
    with api:
        try:
            if cmd == "add":
                password, user = api.create_user(
                    name=name,
                    role=args.role,
                    display_name=args.display_name)
                print(("Successfully created user #{} \"{}\" with role \"{}\". " +
                       "The initial password is \"{}\".").format(
                            user.uid, name, args.role, password))
            elif cmd == "delete":
                if not api.delete_user(user_name=name, force=args.force):
                    print("WARNING: all content created by the user will " +
                          "be deleted.")
                    print("Specify the --force commandline argument to " +
                          "confirm the deletion of users with posts.")
                    print("Consider using \"set-role {} inactive\" " +
                          "instead.".format(name))
                else:
                    print("Successfully deleted user \"{}\"")
            elif cmd == "reset-password":
                password = api.reset_user_password(user_name=name)
                print(("Successfully created a new password for user \"{}\". " +
                       "The new initial password is \"{}\".").format(
                        name, password))
            elif cmd == "set-role":
                api.set_user_role(user_name=name, role=args.role)
                print(("Successfully updated the role of user \"{}\" to \"{}\".").format(
                    name, args.role))
        except tivua.api.ConflictError:
            print(("Error: A user with the specified user name '{}' already "+
                   "exists.").format(args.name))
        except tivua.api.NotFoundError:
            print(("Error: The specified user '{}' does not exist.").format(
                    args.name))
        except tivua.api.ValidationError:
            print(("Error: The specified user name '{}' is invalid.").format(
                    args.name))

def main_config(args):
    """
    Contains the "config" sub-programs.
    """
    import tivua.api

    api = _init(args)
    db_dict = api.db.configuration
    cmd = args.config_command

    with api:
        try:
            if cmd == "list":
                for key, value in db_dict.items():
                    print(key, value)
                
            elif cmd == "get":
                print(db_dict[args.option])
                
            elif cmd == "set":
                db_dict[args.option] = args.value

        except KeyError:
            print("Configuration dictionary does not contain option " + str(args.option))



def main_export(args):
    """
    The "export" sub-program.
    """

    import json, sys

    # Parse the command line arguments
    api = _init(args)

    # Open the target file
    if args.file == '-':
        file = sys.stdout
        must_close_file = False
    else:
        file = open(args.file, 'w')
        must_close_file = True

    try:
        with api:
            # Write the database to a Python object
            obj = api.export_to_object(
                export_passwords=not args.no_export_passwords)

            # Serialise the object
            json.dump(obj, file, indent=4)
        file.write("\n")
    finally:
        # Make sure to close the input file
        if must_close_file:
            file.close()

    return 0


def main(argv):
    # Setup logging
    logging.basicConfig(
        format='[%(levelname)s] %(message)s', level=logging.INFO)

    # Parse the command line
    args = create_parser().parse_args(argv[1:])
    if args.command == "serve":
        return main_serve(args)
    elif args.command == "import":
        return main_import(args)
    elif args.command == "export":
        return main_export(args)
    elif args.command == "user":
        return main_user(args)
    elif args.command == "config":
        return main_config(args)


if __name__ == "__main__":
    import sys
    sys.exit(main(list(sys.argv)))

