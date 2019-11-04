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
import multiprocessing

import logging
logger = logging.getLogger(__name__)


def bundle(filename, cache=None, do_bundle=True, do_minify=True, do_exclude_stub=True):
    """
    For the given HTML file, bundles JS and CSS files included between special
    markers. Returns a firtual filesystem descriptor containig the bundled
    scripts.

    @param cache is a dictionary-like object used for caching minified data. If
           "None" the cache will not be used.
    @param filename is the name of the HTML file that should be bundled
    @param do_bundle if True, this function actually performs bundling. Set to
           False to produce a development version without the stub.
    @param do_minify if True, minifies bundled resources.
    @param do_execlude_stub if True, excludes the stub from the generated
           source.
    """

    def add_bundle(res, name, ext, data, filenames):
        from tivua.minify import Minify

        # Minify the bundle
        minifier = getattr(Minify, ext)
        has_minifier = getattr(Minify, "has_{}_minifier".format(ext))
        if (not do_minify) or (not has_minifier()):
            bundle_data = b'\n'.join(data)
        else:
            # Check whether the minified version is already stored in the cache
            bundle_data, bundle_data_min_idx = [], []
            for i, blob in enumerate(data):
                hash = hashlib.sha256(blob).hexdigest()
                if (not cache is None) and (hash in cache):
                    logger.debug("Using cached minified version of file \"{}\"".format(filenames[i]))
                    bundle_data.append(cache[hash])
                else:
                    logger.debug("Queuing file \"{}\" for minification".format(filenames[i]))
                    bundle_data_min_idx.append((i, hash))

            # Minify all the blobs that need to be minified
            if len(bundle_data_min_idx):
                logger.info("Minifying updated {} files. This may take a while...".format(ext.upper()))
            with multiprocessing.Pool() as pool:
                # Select the subset of blobs that need to be minified and then
                # minify them
                data = [data[i] for i, hash in bundle_data_min_idx]
                data = pool.map(minifier, data)

                # Insert the minified elements into the cache and into the right
                # place in the bundle
                for j, (i, hash) in enumerate(bundle_data_min_idx):
                    bundle_data.insert(i, data[j])
                    if not cache is None:
                        cache[hash] = data[j]

            # Concatenate all minified blobs into a single file
            bundle_data = b'\n'.join(bundle_data)

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
        if not do_bundle:
            continue
        css_data, css_filenames = [], []
        for mhref in re.finditer(style_re2, mrange):
            css_filename = os.path.join(html_path, mhref[1])
            with open(css_filename, "rb") as f:
                css_data.append(f.read())
                css_filenames.append(css_filename)

        # Add the bundled file to the result array
        bundle_filename = add_bundle(res, html_name, "css", css_data, css_filenames)

        # Reference the bundled/minified JS in the HTML
        html_replacements[
            mrange] = "<link rel=\"stylesheet\" href=\"" + bundle_filename + "\" />"

    # Replace all marked script elements
    script_re1 = re.compile(
        r"<!-- SCRIPT( STUB)? BEGIN -->(.*?)<!-- SCRIPT( STUB)? END -->",
        re.DOTALL)
    script_re2 = re.compile(r"<script.*?src=\"(.*?.js)\"", re.DOTALL)
    for mrange in re.findall(script_re1, html):
        # Skip the script stub if requested
        is_stub = bool(mrange[0])
        if is_stub and do_exclude_stub:
            html_replacements[mrange[1]] = ""
            continue

        # Bundle the JS
        if not do_bundle:
            continue
        js_data, js_filenames = [], []
        for mhref in re.finditer(script_re2, mrange[1]):
            js_filename = os.path.join(html_path, mhref[1])
            with open(js_filename, "rb") as f:
                js_data.append(f.read())
                js_filenames.append(js_filename)

        # Add the bundled file to the result array
        bundle_filename = add_bundle(res, html_name, "js", js_data, js_filenames)

        # Reference the bundled/minified JS in the HTML
        html_replacements[
            mrange[1]] = "<script src=\"" + bundle_filename + "\"" + (
                "" if is_stub else " defer") + "></script>"

    # Apply all replacements
    for old, new in html_replacements.items():
        html = html.replace(old, new)

    # Minify the resulting HTML
    bundle_filename = add_bundle(res, html_name, "html",
                                 [html.encode("utf-8")], [filename])
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

    _, files = bundle(sys.argv[1], do_minify=False, do_exclude_stub=False)
    for filename, content in files.items():
        with open(filename, "wb") as f:
            f.write(content["data"])

