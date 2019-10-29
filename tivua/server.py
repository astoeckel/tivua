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

import re
import http.server

################################################################################
# Handlers                                                                     #
################################################################################

def escape(html):
    return (html
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#39;'))

def _handle_error(code, msg):
    def _handler(req, match=None, head=False):
        # Send the header
        req.send_response(code)
        req.send_header('Content-type', 'text/html')
        req.end_headers()

        # Send the header only
        if head:
            return True

        # Generate the actual HTML
        req.wfile.write(b'<h1>' + escape("{}: {}".format(code, msg)) + '</h1>')
        return True
    return _handler

def _handle_index(req, match):
    req.send_response(200)
    req.send_header('Content-type', 'text/html')
    req.end_headers()
    req.wfile.write(b'<h1>Hallo Welt</h1>')
    return True

################################################################################
# Request router                                                               #
################################################################################

class Route:
    def __init__(self, method, path, callback):
        self.method = method.upper()
        self.path = re.compile(path)
        self.callback = callback

    def exec_on_match(self, method, path):
        if (method == self.method) or (method == "HEAD" and self.method=="GET"):
            match = re.match(path)
            if match:
                return self.callback(req, match, method == "HEAD")
        return False

class Router:
    def __init__(self, routes):
        self.routes = routes

    def exec(self, req):
        # Fetch the method and the path
        method = req.command.upper()
        path = req.path

        # Cancle if the path contains a ".." -- this is a malicious request
        if ".." in path:
            _handle_error(404, "Not found")(req, None, method == "HEAD")

#        for route in self.routes:

ROUTES = [
    Route("GET", r"^/$", _handle_index),
    Route("GET", r"^/api/.*$", _handle_error),
    Route("GET", r"^/.*$", _handle_generic),
]

################################################################################
# Public API                                                                   #
################################################################################

def create_server_class(args):

    class Server(http.server.BaseHTTPRequestHandler):
        def do_HEAD(self):
            return

        def do_POST(self):
            return

        def do_GET(self):

    return Server
