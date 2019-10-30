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

def create_parser_serve():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument('--db',
        help='Location of the database file',
        type=str,
        default='./tivua.sqlite')
    parser.add_argument('--verbose',
        help='Port number',
        action='store_true')
    parser.add_argument('--port',
        help='Port number',
        type=check_port_number,
        default=8324)
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

################################################################################
# MAIN PROGRAM                                                                 #
################################################################################

def main_serve(argv):
    # Start the database
    import tivua.server
    import tivua.database

    # Make sure TCP servers can quickly reuse the port after the application
    # exits
    import socketserver
    socketserver.TCPServer.allow_reuse_address = True

    # Parse the command line arguments
    args = create_parser_serve().parse_args(argv)

    # If the verbosity is set to "verbose", set the right level for the root
    # logger.
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Open the database connection
    with tivua.database.Database(args.db) as db:
        # Start the HTTP server
        Server = tivua.server.create_server_class(db, args)
        with socketserver.TCPServer((args.bind, args.port), Server) as httpd:
            logger.info("Serving on http://{}:{}/".format(args.bind, args.port))
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
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
    else:
        logger.error("Invalid subcommand \"{}\"".format(cmd))

if __name__ == "__main__":
    import sys
    sys.exit(main(list(sys.argv)))

