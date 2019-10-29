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
"""
Contains code for bundling index.html and its resources.

@author Andreas Stöckel
"""

import os
import re
import hashlib

import logging
logger = logging.getLogger(__name__)


def bundle(filename, minify=True, exclude_stub=True):
    """
    For the given HTML file, bundles JS and CSS files included between special
    markers. Returns a firtual filesystem descriptor containig the bundled
    scripts.
    """

    def add_bundle(res, name, ext, data):
        # Minify the bundle
        bundle_data = b'\n'.join(data)
        if minify:
            from tivua.minify import Minify
            bundle_data = getattr(Minify, ext)(bundle_data)

        # Compute the hash and generate a unique filename
        bundle_hash = hashlib.sha256(bundle_data).hexdigest()
        bundle_filename = name + "." + bundle_hash[0:16] + ".min." + ext

        # Place the file into the correct subdirectory
        prefix = ""
        if ext == "css":
            prefix = "styles/"
        elif ext == "js":
            prefix = "scripts/"
        bundle_filename = prefix + bundle_filename

        # Add the bundled file to the result array
        res[bundle_filename] = {
            "data": bundle_data,
            "size": len(bundle_data),
            "hash": bundle_hash,
            "immutable": ext != "html",
        }
        return bundle_filename

    # Extract the file extension, name, and path from the given filename
    get_ext = lambda s: (".".join(s.split(".")[:-1]), s.split(".")[-1])
    html_name, html_ext = get_ext(os.path.basename(filename))
    html_path = os.path.dirname(filename)

    # Read the html file
    with open(filename, "rb") as f:
        html = str(f.read(), "utf-8")

    # Initialise the result dictionary containing the compressed files
    res = {}
    html_replacements = {}

    # Replace all marked style elementsfile:///home/andreas/source/tivua/static/
    style_re1 = re.compile(r"<!-- STYLE BEGIN -->(.*?)<!-- STYLE END -->",
                           re.DOTALL)
    style_re2 = re.compile(r"<link.*?href=\"(.*?.css)\"", re.DOTALL)
    for mrange in re.findall(style_re1, html):
        # Bundle the CSS
        css_data = []
        for mhref in re.finditer(style_re2, mrange):
            css_filename = os.path.join(html_path, mhref[1])
            with open(css_filename, "rb") as f:
                css_data.append(f.read())

        # Add the bundled file to the result array
        bundle_filename = add_bundle(res, html_name, "css", css_data)

        # Reference the bundled/minified JS in the HTML
        html_replacements[mrange] = "<link rel=\"stylesheet\" href=\"" + bundle_filename + "\" />"

    # Replace all marked script elements
    script_re1 = re.compile(
        r"<!-- SCRIPT( STUB)? BEGIN -->(.*?)<!-- SCRIPT( STUB)? END -->", re.DOTALL)
    script_re2 = re.compile(r"<script.*?src=\"(.*?.js)\"", re.DOTALL)

    for mrange in re.findall(script_re1, html):
        # Skip the script stub if requested
        if mrange[0] and exclude_stub:
            html_replacements[mrange[1]] = ""
            continue

        # Bundle the CSS
        js_data = []
        for mhref in re.finditer(script_re2, mrange[1]):
            js_filename = os.path.join(html_path, mhref[1])
            with open(js_filename, "rb") as f:
                js_data.append(f.read())

        # Add the bundled file to the result array
        bundle_filename = add_bundle(res, html_name, "js", js_data)

        # Reference the bundled/minified JS in the HTML
        html_replacements[mrange[1]] = "<script src=\"" + bundle_filename + "\" defer></script>"

    # Apply all replacements
    for old, new in html_replacements.items():
        html = html.replace(old, new)

    # Minify the resulting HTML
    bundle_filename = add_bundle(res, html_name, "html", [html.encode("utf-8")])
    return bundle_filename, res


if __name__ == "__main__":
    """
    Provide a simple command line tool for bundling the given HTML file.
    """

    import sys
    if (len(sys.argv) != 2):
        sys.stderr.write("Usage: {} <HTML FILE TO BUNDLE>\n".format(
            sys.argv[0]))
        sys.exit(1)

    _, files = bundle(sys.argv[1], minify=False, exclude_stub=False)
    for filename, content in files.items():
        with open(filename, "wb") as f:
            f.write(content["data"])


