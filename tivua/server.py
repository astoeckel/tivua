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
import json
import traceback

from tivua.api import ValidationError, AuthentificationError

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

    def _handler(req, query=None, match=None, head=False):
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

    def _handler(req, query=None, match=None, head=False):
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

    def _handler(req, query=None, match=None, head=False):
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


def _internal_api_get_session(api, req):
    """
    Checks whether the Authorization header in the given request corresponds to
    a valid session. If yes, queries and returns the session data from the API.
    """

    assert not api is None, "Authorization required, but no API object"

    # Extract the session from the request header
    authorization = req.headers.get("Authorization")
    if not authorization:
        return None
    authorization = authorization.split(" ")
    if len(authorization) != 2 or authorization[0].strip().lower() != "bearer":
        return None

    # Fetch the session data from the API
    return api.get_session_data(authorization[1].strip().lower())


def _internal_wrap_api_handler(cback,
                              field=None,
                              code=200,
                              status="success",
                              requires_auth=True,
                              api=None):
    """
    Common code used to parse API requests. Checks for authentification
    and generates error messages. Deserialises incoming request bodies from
    JSON. Serialises outgoing responses to JSON.
    """

    import codecs
    utf8_writer = codecs.getwriter('utf-8')

    def _handler(req, query=None, match=None, head=False):
        # Copy the response code from the outside
        response_code = code

        # Try the following, report an internal server error if an exception
        # happens here
        try:
            # Handle authentification
            session = None
            if requires_auth:
                session = _internal_api_get_session(api, req)
                if session is None:
                    return _api_error(401)(req)

            # If this request is a POST, check for the Content-Length header and
            # read the provided data into a JSON object
            body = None
            if ((req.command.upper() == "POST")
                    and (req.headers["Content-Length"])):
                length = int(req.headers.get("Content-Length"))
                if length > 0:
                    body = json.loads(req.rfile.read(length))

            # Call the actual callback and obtain the object that should be
            # serialised and sent back to the client
            obj = {"status": status}
            if not head:
                res = cback(req, query, match, session, body)
            else:
                res = {}

            if (field is None):
                assert isinstance(
                    res, dict
                ), "\"field\" is None, so API handler result must be a dictionary"
                for key, value in res.items():
                    obj[key] = value
            else:
                obj[field] = res
        except ValidationError:
            response_code = 400
            obj = {"status": "error", "what": "%server_error_validation"}
        except AuthentificationError:
            response_code = 401
            obj = {"status": "error", "what": "%server_error_authentification"}
        except Exception as e:
            response_code = 500
            obj = {"status": "error", "what": "%server_error_unknown"}
            logger.exception("Error while handling API request")

        # Send the header
        req.send_response(response_code)
        req.send_header('Content-type', mimetype('json'))
        req.end_headers()
        if head:
            return True

        # Send the response
        json.dump(obj, utf8_writer(req.wfile))
        return True

    return _handler


def _api_error(code, msg=None):
    if msg is None:
        msg = http.client.responses[code]

    def _handler(req, query, match, session, body):
        return msg

    return _internal_wrap_api_handler(_handler, code=code, requires_auth=False)


def _api_get_configuration(api):
    def _handler(req, query, match, session, body):
        return api.get_configuration_object()

    return _internal_wrap_api_handler(_handler, requires_auth=False)


def _api_get_session(api):
    def _handler(req, query, match, session, body):
        return session

    return _internal_wrap_api_handler(_handler, field="session", api=api)


def _api_get_login_challenge(api):
    def _handler(req, query, match, session, body):
        return api.get_password_login_challenge()

    return _internal_wrap_api_handler(_handler, requires_auth=False)


def _api_post_login(api):
    def _handler(req, query, match, session, body):
        # Validate the request
        if not (body and ('user_name' in body) and ('challenge' in body) and
                ('response' in body)):
            raise ValidationError()

        # Try to login using a username password combination
        return api.login_method_username_password(
            body['user_name'], body['challenge'], body['response'])

    return _internal_wrap_api_handler(
        _handler, field='session', requires_auth=False)


def _api_post_logout(api):
    def _handler(req, query, match, session, body):
        api.logout(session['sid'])
        return {}

    return _internal_wrap_api_handler(_handler, api=api)


def _api_get_settings(api):
    def _handler(req, query, match, session, body):
        return api.get_user_settings(session['uid'])

    return _internal_wrap_api_handler(_handler, field="settings", api=api)


def _api_post_settings(api):
    def _handler(req, query, match, session, body):
        return api.update_user_settings(session['uid'], body)

    return _internal_wrap_api_handler(_handler, field="settings", api=api)


def _api_get_posts_list(api):
    def _handler(req, query, match, session, body):
        print(query)
        return {
            "posts": [],
            "total": 0,
        }

    return _internal_wrap_api_handler(_handler, api=api)


################################################################################
# REQUEST ROUTER                                                               #
################################################################################


class Route:
    """
    The Route class is a tuple (method, path, callback), where "method" is the
    HTTP request method (e.g., "GET" or "POST"), "path" is a regular
    expression string used to match the requested path, and callback is a
    function that should be called whenever the method and path match a
    user-request. The callback may return "True" or "None" if the request was
    handled, or "False", if the request was not handled.
    """

    def __init__(self, method, path, callback):
        """
        Constructor of the Route class.

        @param method is the HTTP request method, e.g. ("GET" or "POST"). Must
               be in uppercase letters. The method is ignored, if the request
               method is "head".
        @param path is the requested HTTP path.
        @param callback is the callback function that should be called whenever
               both the method and the path match. The callback receives a
               reference at the request object, the path regular expression
               match and a flag indicating whether the request was actually a
               HTTP head request. Must return "True" or "None" if the request
               was handled, and "False" if the request was declined.
        """
        self.method = method.upper()
        self.path = re.compile(path)
        self.callback = callback

    def exec_on_match(self, req, method, head, path, query):
        """
        Used internally to test whether a request matches the route description.
        This funciton is called by the Router. Returns False if the path does
        not match the regular expression given in the constructor, otherwise
        calls the callback and returns its return value.

        @param req is the request object.
        @param method is the request method.
        @param head is True if the method is "HEAD".
        @param path is the requested path
        """
        if (self.method == "*") or (method == self.method) or head:
            match = self.path.match(path)
            if match:
                return self.callback(req, query, match, head)
        return False


class Router:
    """
    The Router manages a collection of Route objects and directs incoming
    requests to the routes.
    """

    def __init__(self, routes):
        """
        Initialises the router with the given set of routes.

        @param routes is a list of either Route objects or "None". "None"
               entries in the list are skipped.
        """
        self.routes = routes

    @staticmethod
    def _parse_path(path):
        from urllib.parse import parse_qs

        # Reject malicious paths
        if (len(path) == 0) or (path[0] != '/') or (".." in path):
            return None, None

        # Parse the query string
        query = {}
        if "?" in path:
            path, query = path.split("?", 1)
            query = parse_qs(query)

        return path, query

    def exec(self, req):
        """
        Executes the router for the given request. Returns True if a route was
        successfully executed, otherwise sends a 404 error and returns False.

        @param req is the request object (an instance of BaseHTTPRequestHandler)
        """

        # Fetch the method and the path, reject malformed paths
        method = req.command.upper()
        head = method == "HEAD"
        path, query = self._parse_path(req.path)
        if path is None:
            _handle_error(404)(req, None, head)
            return False
        logger.debug("Router request for path={}, query={}".format(
            path, repr(query)))

        # Try to execute the request
        for route in self.routes:
            if route is None:
                continue
            res = route.exec_on_match(req, method, head, path, query)
            if res or (res is None):
                return True

        # No route matched, issue a 404 error
        _handle_error(404)(req, None, head)
        return False


################################################################################
# PUBLIC API                                                                   #
################################################################################


def create_server_class(api, args):
    from tivua.bundle import bundle

    # Fetch some often needed arguments
    root = args.document_root
    no_dev = args.no_dev

    # Create the virtual filesystem (VFS) containing the document root
    logger.info("Bundling static resources into the VFS")
    vfs_index, vfs = bundle(
        os.path.join(root, 'index.html'),
        cache=api.db.cache,
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
        #
        # Index page and development mode
        #

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

        #
        # API Requests
        #

        # Configuration request
        Route("GET", r"^/api/configuration$", _api_get_configuration(api)),
        # Settings request
        Route("GET", r"^/api/settings$", _api_get_settings(api)),
        # Settings request
        Route("POST", r"^/api/settings$", _api_post_settings(api)),
        # Session data request
        Route("GET", r"^/api/session$", _api_get_session(api)),
        # Login request
        Route("POST", r"^/api/session/login$", _api_post_login(api)),
        # Login challenge request
        Route("GET", r"^/api/session/login/challenge$", _api_get_login_challenge(api)),
        # Logout request
        Route("POST", r"^/api/session/logout$", _api_post_logout(api)),

        # List posts request
        Route("GET", r"^/api/posts/list$", _api_get_posts_list(api)),


        # Unkown API requests
        Route("*", r"^/(api/.*|api)$", _api_error(404)),

        #
        # Generic file and VFS requests
        #

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

