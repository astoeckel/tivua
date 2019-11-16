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

"""
@file minify.py

Wrapper code for minifying HTML, CSS and JS code. Runs corresponding external
programs in subprocesses. Fails gracefully (i.e., does nothing) in case those
programs are not installed.

@author Andreas Stöckel
"""

import logging
logger = logging.getLogger(__name__)


class Minify:
    """
    The Minify class provides wrapers around some tools from the npm ecosystem
    for compressing html, css, and js. In case these tools are not installed,
    the minifier does nothing.
    """

    _MINIFIERS = {
        "html": None,
        "css": None,
        "js": None,
    }

    _HTML_TEST_IN = b'<!DOCTYPE html>\n<html>\n<!--Foo-->\n</html>'
    _HTML_TEST_OUT = b'<!doctype html><html></html>'

    _CSS_TEST_IN = b'i {display: block; border-color: white;}'
    _CSS_TEST_OUT = b'i{display:block;border-color:#fff}\n'

    _JS_TEST_IN = b'(function () { console.log("foo"); })()'
    _JS_TEST_OUT = b'(function(){console.log("foo")})();'

    @staticmethod
    def _minify_stub(s):
        return s

    @staticmethod
    def _search_npm_executable(exe):
        # First try to search the executable within the "./node_modules/"
        # subdirectory
        import os
        local_npm_exe = os.path.abspath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "../node_modules/.bin/{}".format(exe)
        ))
        if os.path.isfile(local_npm_exe):
            logger.debug(
                "Found locally installed NPM executable \"%s\"", exe)
            return local_npm_exe

        # Otherwise purely rely on the system PATH
        return exe

    @staticmethod
    def _get_minifiers():
        """
        Used internally to globally initialise the minifier instances.
        """

        def exec_(data, args):
            import subprocess
            try:
                with subprocess.Popen(
                        [Minify._search_npm_executable(args[0])] + args[1:],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        stdin=subprocess.PIPE) as p:
                    out, _ = p.communicate(data)
            except:
                return ''
            return out

        def init(name, minifier, test_in, test_out, package):
            if not Minify._MINIFIERS[name]:
                if minifier(test_in) == test_out:
                    Minify._MINIFIERS[name] = minifier
                else:
                    logger.warning(
                        "Install the npm package \"%s\" to minify %s",
                        package, name)
                    Minify._MINIFIERS[name] = Minify._minify_stub
            return

        def html_minify(data):
            return exec_(data,
                ["html-minifier", "--case-sensitive",
                 "--collapse-boolean-attributes", "--collapse-whitespace",
                 "--remove-comments", "--remove-script-type-attributes",
                 "--sort-attributes", "--sort-class-name", "--use-short-doctype"
            ])

        def css_minify(data):
            return exec_(data, args=["csso", "-i", "/dev/stdin"])

        def js_minify(data):
            return exec_(data, ["minify"])

        init("html", html_minify, Minify._HTML_TEST_IN, Minify._HTML_TEST_OUT,
             "html-minifier")
        init("css", css_minify, Minify._CSS_TEST_IN, Minify._CSS_TEST_OUT,
             "csso-cli")
        init("js", js_minify, Minify._JS_TEST_IN, Minify._JS_TEST_OUT,
             "babel-minify")

        return Minify._MINIFIERS

    @staticmethod
    def has_html_minifier():
        return Minify._get_minifiers()["html"] != Minify._minify_stub

    @staticmethod
    def has_css_minifier():
        return Minify._get_minifiers()["css"] != Minify._minify_stub

    @staticmethod
    def has_js_minifier():
        return Minify._get_minifiers()["js"] != Minify._minify_stub

    @staticmethod
    def html(s):
        """
        Minifies HTML files using css_html_js_minify.
        """
        return Minify._get_minifiers()["html"](s)

    @staticmethod
    def css(s):
        """
        Minifies CSS files using css_html_js_minify.
        """
        return Minify._get_minifiers()["css"](s)

    @staticmethod
    def js(s):
        """
        Minifies JavaScript code using babel-minify.
        """
        return Minify._get_minifiers()["js"](s)


if __name__ == "__main__":
    """
    Provide a simple command line tool for minifying css, js, and html files.
    """

    import sys
    if (len(sys.argv) != 2):
        sys.stderr.write("Usage: {} <FILE TO MINIFY>\n".format(sys.argv[0]))
        sys.exit(1)

    fn, ext = sys.argv[1], sys.argv[1].split(".")[-1].lower()
    with open(sys.argv[1], "rb") as f:
        data = f.read()
        if ext in ["html", "css", "js"]:
            sys.stdout.write(str(getattr(Minify, ext)(data), "utf-8"))
        else:
            sys.stderr.write("Unknown file extension \"{}\"".format(ext))

