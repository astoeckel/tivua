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

import re, os
import http.server
import http.client
import json

################################################################################
# LOGGER                                                                       #
################################################################################

import logging
logger = logging.getLogger(__name__)

################################################################################
# HELPER FUNCTIONS                                                             #
################################################################################

def mimetype(filename):
    """
    Returns the mime type based on the file extension.
    """
    MIME_MAP = {
        "woff2": "font/woff2",
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "json": "application/json",
        "manifest": "application/manifest+json",
        "css": "text/css; charset=utf-8",
        "svg": "image/svg+xml",
        "ico": "image/x-icon",
        "png": "image/png",
    }

    # Get the file extension
    ext = (filename.split(".")[-1]).lower()
    if ext in MIME_MAP:
        return MIME_MAP[ext]

    # Otherwise, return a safe default MIME type
    return "application/octet-stream"


def escape(text):
    """
    Escapes text for safe inclusion in HTML.
    """
    return (text.replace('&', '&amp;').replace('<', '&lt;').replace(
        '>', '&gt;').replace('"', '&quot;').replace("'", '&#39;'))

################################################################################
# REQUEST HANDLERS                                                             #
################################################################################

################################################################################
# Generic filesystem and virtual filesystem handlers                           #
################################################################################

def _handle_vfs(vfs, vfs_filename=None, vfs_content_type=None):
    """
    Creates a handler that resolves file in the virtual filesystem.
    """

    def _handler(req, match=None, head=False):
        # If no vfs_filename has been specified, check whether the user-provided
        # file is stored in the vfs
        filename = None
        if vfs_filename:
            filename = vfs_filename
        elif match:
            if (match[0][1:] in vfs):
                filename = match[0][1:]

        # If no file has been found, return
        if filename is None:
            return False

        # Send the header
        req.send_response(200)
        req.send_header('Content-type', mimetype(filename))
        if vfs[filename]["immutable"]:
            req.send_header('Cache-control',
                            'public,max-age=31536000,immutable')
        req.end_headers()
        if head:
            return True

        # Dump the VFS content
        req.wfile.write(vfs[filename]["data"])
        return True

    return _handler


def _handle_fs(document_root, static_filename=None):
    """
    Creates a handler that resolves file in the virtual filesystem.
    """

    # Get the canonical document root
    document_root = os.path.realpath(document_root)

    def _handler(req, match=None, head=False):
        # If no vfs_filename has been specified, check whether the user-provided
        # file is stored in the vfs
        filename = None
        if static_filename:
            filename = os.path.join(document_root, static_filename)
        elif match:
            filename = os.path.join(document_root, match[0][1:])

        # If no file has been found, return
        if (not filename) or (not os.path.isfile(filename)):
            return False

        # Make sure the file is truely a child of the document root
        filename = os.path.realpath(filename)
        if (not filename.startswith(document_root)):
            return False

        # Send the header
        req.send_response(200)
        req.send_header('Content-type', mimetype(filename))
        req.end_headers()
        if head:
            return True

        # Dump the file
        with open(filename, 'rb') as f:
            req.wfile.write(f.read())
        return True

    return _handler

################################################################################
# Generic (non-API) error handler                                              #
################################################################################

def _handle_error(code, msg=None):
    """
    Creates a handler that responds with the given HTTP error code.
    """

    ERROR_PAGE = '''
    <!doctype html><head><style>body {{
        position: fixed;
        top: calc(50% - 7em);
        left: 0;
        right: 0;
        font-family: sans-serif;
        text-align: center;
    }}
    h1, h2 {{
        text-transform: uppercase;
    }}
    h1 {{
        color: #5c3566;
    }}
    h1 span {{
        display: block;
        font-size: 250%;
        margin-bottom: 1rem;
    }}
    hr {{
        width: 10rem;
        bottom: none;
        border-bottom: 2px solid #5c3566;
    }}</style></head><body><h1><span>🤖</span>{}</h1><hr/><h2>{}</h2></body>
    '''

    # If no message is given, try to lookup the correct status code
    if msg is None:
        msg = http.client.responses[code]

    def _handler(req, match=None, head=False):
        # Send the header
        req.send_response(code)
        req.send_header('Content-type', mimetype('html'))
        req.end_headers()
        if head:
            return True

        # Generate the actual HTML
        req.wfile.write(
            ERROR_PAGE.format(escape(str(code)), escape(msg)).encode('utf-8'))
        return True

    return _handler

################################################################################
# API handlers                                                                 #
################################################################################

def _wrap_api_handler(field, cback, code=200, status="success"):
    import codecs
    utf8_writer = codecs.getwriter('utf-8')

    def _handler(req, match=None, head=False):
        # Send the header
        req.send_response(code)
        req.send_header('Content-type', mimetype('json'))
        req.end_headers()
        if head:
            return True

        # Call the actual callback and obtain the object that should be
        # serialised and sent back to the client
        try:
            obj = {
                "status": status,
                field: cback(req, match)
            }
        except Exception as e:
            obj = {
                "status": "error",
                "what": str(e)
            }
        json.dump(obj, utf8_writer(req.wfile))
        return True

    return _handler

def _handle_api_error(code, msg=None):
    if msg is None:
        msg = http.client.responses[code]
    def _handler(req, match=None, head=False):
        return msg
    return _wrap_api_handler("what", _handler, code=code, status="error")

def _handle_api_configuration(db):
    def _handler(req, match):
        return db.get_configuration_object()
    return _wrap_api_handler("configuration", _handler)


################################################################################
# REQUEST ROUTER                                                               #
################################################################################


class Route:
    def __init__(self, method, path, callback):
        self.method = method.upper()
        self.path = re.compile(path)
        self.callback = callback

    def exec_on_match(self, req, method, head, path):
        if (method == self.method) or (head and self.method == "GET"):
            match = self.path.match(path)
            if match:
                return self.callback(req, match, head)
        return False


class Router:
    def __init__(self, routes):
        self.routes = routes

    def exec(self, req):
        # Fetch the method and the path
        method = req.command.upper()
        head = method == "HEAD"
        path = req.path

        # Cancel if the path contains a ".." -- this is a malicious request
        if (len(path) == 0) or (path[0] != '/') or (".." in path):
            _handle_error(404)(req, None, head)
            return False

        # Try to execute the request
        for route in self.routes:
            if route is None:
                continue
            res = route.exec_on_match(req, method, head, path)
            if res or (res is None):
                return True

        # No route matched, issue a 404 error
        _handle_error(404)(req, None, head)
        return False


################################################################################
# PUBLIC API                                                                   #
################################################################################


def create_server_class(db, args):
    from tivua.bundle import bundle

    # Fetch some often needed arguments
    root = args.document_root
    no_dev = args.no_dev

    # Create the virtual filesystem (VFS) containing the document root
    logger.info("Bundling static resources into VFS (this may take a while for fresh Tivua instances)")
    vfs_index, vfs = bundle(
        os.path.join(root, 'index.html'),
        cache=db.cache,
        do_exclude_stub=True,
    )

    # Create the development version of the code
    dev_vfs_index, dev_vfs = vfs_index, vfs
    if not no_dev:
        dev_vfs_index, dev_vfs = bundle(
            os.path.join(root, 'index.html'),
            do_bundle=False,
            do_minify=False,
            do_exclude_stub=True,
        )

    # Setup the routes
    router = Router([
        # Always serve the "index.html" file from the VFS when "/" is requested
        Route("GET", r"^/$", _handle_vfs(vfs, vfs_index, "text/html")),
        # When "/index.html" is requested explicitly, serve from the development
        # VFS, which may be equal to the normal VFS (see above)
        Route("GET", r"^/index\.html$",
              _handle_vfs(dev_vfs, dev_vfs_index, "text/html")),
        # If development is disabled, answer with a 404 when any non-minified
        # sources are requested
        Route("GET", r"^/(lib|scripts|styles)/(?!.*(\.min\.js|\.min\.css)).*$", _handle_error(404)) \
            if no_dev else None,
        # Re-route the request for the favicon to the images subfolder
        Route("GET", r"^/favicon\.ico$", _handle_fs(root, "images/favicon.ico")),
        # Configuration API request
        Route("GET", r"^/api/configuration$", _handle_api_configuration(db)),
        # Unkown API request
        Route("GET", r"^/(api/.*|api)$", _handle_api_error(404)),
        # Try to handle generic requests from the VFS
        Route("GET", r"^/(.*)$", _handle_vfs(vfs)),
        # Last option, fall back to the real filesystem
        Route("GET", r"^/(.*)$", _handle_fs(root)),
    ])

    # Define the actual server class
    class Server(http.server.BaseHTTPRequestHandler):
        def do_HEAD(self):
            router.exec(self)

        def do_POST(self):
            router.exec(self)

        def do_GET(self):
            router.exec(self)

    return Server
