# Tivua ‒ Shared Research Blog

![GitHub](https://img.shields.io/github/license/astoeckel/tivua?style=flat-square) ![GitHub top language](https://img.shields.io/github/languages/top/astoeckel/tivua?style=flat-square)

## 🚧 This project is still under heavy development 🚧

## 🚀 Launching Tivua

*Tivua* consists of two parts. The first part is a web application server, written in Python, and the second part is the frontend UI, written in HTML, JavaScript (ES6) and CSS.

To run *Tivua* on your local machine, you need at least Python 3.7 installed, as well as a modern web-browser (tested with Firefox 70 and Chromium 77). There are no further dependencies.

Open a command prompt/terminal and ‒ assuming that `git` and `python3` are in your `PATH` ‒ simply run
```sh
git clone https://github.com/astoeckel/tivua
cd tivua
python3 tivua.py serve
```
Follow the on-screen instructions, i.e., navigate to `http://127.0.0.1:9368/`. In the terminal window, press `CTRL-C` on your keyboard to stop the web application server.

To get a list of available command line arguments, run
```sh
python3 tivua.py serve --help
```

### Managing Tivua from the command line

The above command starts *Tivua* in `serve` mode. In this mode, *Tivua* provides an HTTP webserver. There are other commands besides `serve`, allowing you to administrate a *Tivua* instance. For example, you can add and remove users or reset a user's password. This comes handy for automation tasks or in case you've locked yourself out of the web UI. Due to the magic of the underlying SQLite database all these operations should even work on currently running *Tivua* instances.

To see a list of available sub-commands, simply run
```sh
python3 tivua.py --help
```

### Optional run-time dependencies

Optionally, (but highly recommended, if you plan to deploy *Tivua* on a larger scale), you can install the following `npm` ([Node Package Manager](https://www.npmjs.com/)) packages. *Tivua* will then automatically minify the frontend code, drastically reducing the initial page-load time at the cost of a prolonged first startup of the web application server (the minified content is cached, so this will only happen once).

The names of the optional `npm` packages should be displayed in the log, but ‒ just for completeness ‒ here is what you need to run on the command line (this is Linux specific, but `npm` is also available for Windows)
```
sudo npm install -g html-minifier csso-cli babel-minify
```

## 🔬 Development mode

Navigate to the following URL during local development:

```
http://127.0.0.1:9368/index.html
```

This will cause *Tivua* to serve the frontend code in development mode instead of deployment mode.

### Details

Per default, *Tivua* tries to serve a bundled, minified version of the front-end JavaScript source code.  This is a little inconvenient for development, so you can access the unminified source code by explicitly navigating to `/index.html` instead of the web root `/`. *Tivua* will then always serve the newest version of frontend code from disk.

**Note:** At the moment, an exception to this rule is `index.html` itself. This file is always served from the internal Virtual File System (VFS) generated at start time.

### Deactivating development mode for deployment

You can deactivate the development mode by passing `--no-dev` as a parameter to `tivua.py serve`.

## FAQ

**Q: How can I access the *Tivua* server from other computers in the local network?**

**A:** Short answer: Per default, *Tivua* only binds itself via IPv4 to the loopback adapter, meaning it only listens to requests originating from the local machine.  To listen on all network adapters, run
```sh
python3 tivua.py serve --bind 0.0.0.0
```

Long answer: Don't run the above command. For security reasony, you should *always* run *Tivua* behind a reverse proxy such as [nginx](https://nginx.org/) when making it available over the network. (*TODO*: Add some example Nginx configuration files.)

**Q: How do I serve *Tivua* via HTTPs? How do I enable gzip or HTTP request caching?**

Use a reverse proxy. See above.

**Q: What's with the name?**

**A:** Accoring to Wikipedia, [Tivua](https://en.wikipedia.org/wiki/Tivua_Island) “is an island of the Mamanuca Islands, Fiji”. There is no particular reason I chose this name, other than that it was brought to me by Wikipedia's “Random article” feature, and the fact that there are only few hits on GitHub for projects with this name ‒ in contrast to all the other names from Greek/Roman/Indian/Scandinavian/Tolkien's mythology I came up with.

## License

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.txt) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
