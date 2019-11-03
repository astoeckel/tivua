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

DEFAULT_DB = './tivua.sqlite'

def check_port_number(i):
    i = int(i)
    if (i <= 0) or (i > 65535):
        raise argparse.ArgumentTypeError("Invalid port number")
    return i

def create_parser_default():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument('--db',
        help='Location of the database file',
        type=str,
        default=DEFAULT_DB)
    parser.add_argument('--verbose',
        help='Print debug log messages',
        action='store_true')
    return parser

def create_parser_serve():
    parser = create_parser_default()
    parser.add_argument('--port',
        help='Port number',
        type=check_port_number,
        default=9368)
    parser.add_argument('--bind',
        help='Address of the interface the server should bind to',
        type=str,
        default='127.0.0.1')
    parser.add_argument('--no-dev',
        help='Disable serving debug versions of the frontend',
        action='store_true')
    parser.add_argument('--document-root',
        help='Sets the web root directory',
        type=str,
        default='./static/')
    return parser

def create_parser_import():
    parser = create_parser_default()
    parser.add_argument('file',
        help='The backup to import. The value \'-\' reads the dump from stdin',
        default='-', nargs='?')
    return parser

def create_parser_export():
    parser = create_parser_default()
    parser.add_argument('file',
        help='The backup file to export to. The value \'-\' writes the dump to stdout',
        type=str,
        default='-', nargs='?')
    return parser


################################################################################
# MAIN PROGRAM                                                                 #
################################################################################

def _parse_default_args(parser_ctor, argv):
    """
    Helper function that parses the arguments shared by all Tivua sub-programs.
    """
    import tivua.database

    # Create the argument parser and parse the provided arguments
    args = parser_ctor().parse_args(argv)

    # Increase the verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Open the database
    db = tivua.database.Database(args.db)

    return args, db

def main_serve(argv):
    import tivua.server
    import tivua.api

    # Make sure TCP servers can quickly reuse the port after the application
    # exits
    import socketserver
    socketserver.TCPServer.allow_reuse_address = True

    # Parse the command line arguments
    args, db = _parse_default_args(create_parser_serve, argv)

    # Open the database connection
    with db:
        # Create an API instance and connect the database to it
        api = tivua.api.API(db)

        # Start the HTTP server
        Server = tivua.server.create_server_class(api, args)
        with socketserver.TCPServer((args.bind, args.port), Server) as httpd:
            logger.info("Serving on http://{}:{}/".format(args.bind, args.port))
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                pass

def main_import(argv):
    import time, sys, json, datetime
    import tivua.database

    # Parse the command line arguments
    args, db = _parse_default_args(create_parser_import, argv)

    # Open the target file
    if args.file == '-':
        file = sys.stdin
        must_close_file = False
    else:
        file = open(args.file, 'r')
        must_close_file = True

    try:
        # Open the database
        with db:
            # Deserialise the provided JSON file
            obj = json.load(file)

            # Create a backup of the database
            backup_filename = '.tivua_backup_{date:%Y-%m-%d_%H_%M_%S}.json'.format(date=datetime.datetime.now())
            logger.warning('Writing database backup to \"{}\"'.format(backup_filename))
            with open(backup_filename, 'w') as backup_file:
                json.dump(db.export_to_json(), backup_file)

            # Import the database
            try:
                logger.info('Purging the database and importing data...')
                db.import_from_json(obj)
                logger.info('Done!')
            except:
                logger.exception('There was an error while importing the data, the database should have been rolled back to its original state.')
    finally:
        # Make sure to close the input file
        if must_close_file:
            file.close()

def main_export(argv):
    import tivua.database

    # Parse the command line arguments
    args = create_parser_export().parse_args(argv)

    pass

def main(argv):
    # Setup logging
    logging.basicConfig(format='[%(levelname)s] %(message)s', level=logging.INFO)

    # If no subcommand is given, assume that we're supposed to serve the
    # application
    if len(argv) == 1:
        argv.append("serve")
    elif argv[1].startswith('--'):
        argv.insert(1, "serve")

    # Fetch the command and remove the corresponding entry from the argv
    # array
    cmd = argv[1].lower()
    del argv[0]
    del argv[0]

    # Depending on the command, launch the corresponding subprogram
    if cmd == "serve":
        main_serve(argv)
    elif cmd == "import":
        main_import(argv)
    elif cmd == "export":
        main_export(argv)
    else:
        logger.error("Invalid subcommand \"{}\"".format(cmd))

if __name__ == "__main__":
    import sys
    sys.exit(main(list(sys.argv)))

