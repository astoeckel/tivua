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
logging.basicConfig(format='[%(levelname)s] %(asctime)s: %(message)s', level=logging.INFO)
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

def create_parser():
	parser = argparse.ArgumentParser(
		formatter_class=argparse.ArgumentDefaultsHelpFormatter)
	parser.add_argument('--db',
		help='Location of the database file',
		type=str,
		default='./tivua.sqlite')
	parser.add_argument('--config',
		help='Location of the configuration file',
		type=str,
		default='./tivua.ini')
	parser.add_argument('--port',
		help='Port number',
		type=check_port_number,
		default=8324)
	parser.add_argument('--no-dev-mode',
		help='Disable serving debug versions of all files',
		type=check_bool,
		default=False)
	return parser

################################################################################
# ACTUAL SERVER                                                                #
################################################################################

import http.server
import socketserver
socketserver.TCPServer.allow_reuse_address = True

class Server(http.server.BaseHTTPRequestHandler):
	def do_HEAD(self):
		return

	def do_POST(self):
		return

	def do_GET(self):
		self.send_response(200)
		self.send_header('Content-type', 'text/html')
		self.end_headers()
		self.wfile.write(b'<h1>Hallo Welt</h1>')

def _serve(port):
	with socketserver.TCPServer(("", args.port), Server) as httpd:
		logger.info("Serving on port {}...".format(args.port))
		try:
			httpd.serve_forever()
		except KeyboardInterrupt:
			pass

def main(args, argv):
	logger.info("Done")

