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

def check_bool(v):
    if isinstance(v, bool):
       return v
    if v.lower() in ('yes', 'true', 't', 'y', '1'):
        return True
    elif v.lower() in ('no', 'false', 'f', 'n', '0'):
        return False
    else:
        raise argparse.ArgumentTypeError('Boolean value expected.')

def create_parser_serve():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument('--db',
        help='Location of the database file',
        type=str,
        default='./tivua.sqlite')
    parser.add_argument('--config',
        help='Location of the configuration file',
        type=str,
        default='./tivua.conf')
    parser.add_argument('--port',
        help='Port number',
        type=check_port_number,
        default=8324)
    parser.add_argument('--bind',
        help='Address of the interface the server should bind to',
        type=str,
        default='127.0.0.1')
    parser.add_argument('--minify',
        help='Minify the CSS/JS/HTML before bundling (slow)',
        type=check_bool,
        default=False)
    parser.add_argument('--no-dev-mode',
        help='Disable serving debug versions of all files',
        type=check_bool,
        default=False)
    parser.add_argument('--document-root',
        help='Sets the web root directory',
        type=str,
        default='static/')
    return parser

################################################################################
# MAIN PROGRAM                                                                 #
################################################################################

def main_serve(argv):
    import tivua.server
    import socketserver
    socketserver.TCPServer.allow_reuse_address = True

    # Parse the arguments
    args = create_parser_serve().parse_args(argv)

    # TODO: Read the configuration

    # Start the HTTP server
    Server = tivua.server.create_server_class(args)
    with socketserver.TCPServer((args.bind, args.port), Server) as httpd:
        logger.info("Serving on {}:{}...".format(args.bind, args.port))
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

    # Select the correct sub-program
    try:
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
    except Exception as e:
        logger.fatal(str(e))
        return -1
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main(list(sys.argv)))

