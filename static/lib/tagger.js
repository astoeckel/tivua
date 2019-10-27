/**@license
 *  _____
 * |_   _|___ ___ ___ ___ ___
 *   | | | .'| . | . | -_|  _|
 *   |_| |__,|_  |_  |___|_|
 *           |___|___|   version 0.2.0
 *
 * Tagger - Vanilla JavaScript Tag Editor
 *
 * Copyright (c) 2018-2019 Jakub T. Jankiewicz <https://jcubic.pl/me>
 * Released under the MIT license
 */

/**
 * Modified for use in Tivua by Andreas Stöckel, 2019
 *
 * - remove unused completion code
 * - trim tags before addition
 * - do not add empty tags
 * - focus input when clicking on outer text div
 */

/* global define, module, global */
(function(root, factory, undefined) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.tagger = factory();
    }
})(typeof window !== 'undefined' ? window : global, function(undefined) {
    // ------------------------------------------------------------------------------------------
    var get_text = (function() {
        var div = document.createElement('div');
        var text = ('innerText' in div) ? 'innerText' : 'textContent';
        return function(element) {
            return element[text];
        };
    })();
    // ------------------------------------------------------------------------------------------
    function tagger(input, options) {
        if (input.length) {
            return Array.from(input).map(function(input) {
                return new tagger(input, options);
            });
        }
        if (!(this instanceof tagger)) {
            return new tagger(input, options);
        }
        var settings = merge({}, tagger.defaults, options);
        this.init(input, settings);
    }
    // ------------------------------------------------------------------------------------------
    function merge() {
        if (arguments.length < 2) {
            return arguments[0];
        }
        var target = arguments[0];
        [].slice.call(arguments).reduce(function(acc, obj) {
            if (is_object(obj)) {
                Object.keys(obj).forEach(function(key) {
                    if (is_object(obj[key])) {
                        if (is_object(acc[key])) {
                            acc[key] = merge({}, acc[key], obj[key]);
                            return;
                        }
                    }
                    acc[key] = obj[key];
                });
            }
            return acc;
        });
        return target;
    }
    // ------------------------------------------------------------------------------------------
    function is_object(arg) {
        if (typeof arg !== 'object' || arg === null) {
            return false;
        }
        return Object.prototype.toString.call(arg) === '[object Object]';
    }
    // ------------------------------------------------------------------------------------------
    function create(tag, attrs, children) {
        tag = document.createElement(tag);
        Object.keys(attrs).forEach(function(name) {
            if (name === 'style') {
                Object.keys(attrs.style).forEach(function(name) {
                    tag.style[name] = attrs.style[name];
                });
            } else {
                tag.setAttribute(name, attrs[name]);
            }
        });
        if (children !== undefined) {
            children.forEach(function(child) {
                var node;
                if (typeof child === 'string') {
                    node = document.createTextNode(child);
                } else {
                    node = create.apply(null, child);
                }
                tag.appendChild(node);
            });
        }
        return tag;
    }
    var id = 0;
    // ------------------------------------------------------------------------------------------
    tagger.defaults = {
        allow_duplicates: false,
        allow_spaces: true,
    };
    // ------------------------------------------------------------------------------------------
    tagger.fn = tagger.prototype = {
        init: function(input, settings) {
            this._id = ++id;
            var self = this;
            this._settings = settings;
            this._ul = document.createElement('ul');
            this._input = input;
            this._placeholder = input.getAttribute('placeholder');
            var wrapper = this._wrapper = document.createElement('div');
            wrapper.className = 'tagger';
            this._input.setAttribute('hidden', 'hidden');
            this._input.setAttribute('type', 'hidden');
            var li = document.createElement('li');
            li.className = 'tagger-new';
            this._new_input_tag = document.createElement('input');
            if (this._settings.placeholder) {
                this._new_input_tag.setAttribute('placeholder', this._placeholder);
            }
            this.tags_from_input();
            li.appendChild(this._new_input_tag);
            this._ul.appendChild(li);
            input.parentNode.replaceChild(wrapper, input);
            wrapper.appendChild(input);
            wrapper.appendChild(this._ul);
            this._add_events();
        },
        // --------------------------------------------------------------------------------------
        _update_input: function () {
            let old_value = this._input.value;
            let value = this._tags.join(',');
            let new_input_value = this._new_input_tag.value.trim();
            if (new_input_value) {
                value += "," + new_input_value;
            }
            this._input.value = value;
            if (value !== old_value) {
                let evt = document.createEvent('HTMLEvents');
                evt.initEvent('change', false, true);
                this._input.dispatchEvent(evt);
            }
        },
        // --------------------------------------------------------------------------------------
        _add_events: function() {
            var self = this;
            this._ul.addEventListener('click', function(event) {
                if (event.target.classList.contains('close')) {
                    var span = event.target.closest('span');
                    var li = span.parentNode;
                    var name = span.querySelector('span').innerText;
                    self.remove_tag(name);
                    event.preventDefault();
                }
                event.cancelBubble = true;
            });
            // ----------------------------------------------------------------------------------
            this._new_input_tag.addEventListener('keydown', function(event) {
                if (event.keyCode === 13 || event.keyCode === 188 ||
                    (event.keyCode === 32 && !self._settings.allow_spaces)) { // enter || comma || space
                    if (self.add_tag(self._new_input_tag.value)) {
                        self._new_input_tag.value = '';

                        /* Emit a keyboard event to inform the autocomplete
                           component */
                        let evt = document.createEvent('KeyboardEvent');
                        evt.initKeyEvent("keyup", true, true, null, false, false, false, false, 8, 0,);
                        self._new_input_tag.dispatchEvent(evt);
                    }
                    event.preventDefault();
                } else if (event.keyCode === 8 && !self._new_input_tag.value) { // backspace
                    if (self._tags.length > 0) {
                        self.remove_tag(self._tags[self._tags.length - 1]);
                    }
                    event.preventDefault();
                }
            });
            // ----------------------------------------------------------------------------------
            this._wrapper.addEventListener('click', (e) => {
                this._new_input_tag.focus();
            });
            // ----------------------------------------------------------------------------------
            this._new_input_tag.addEventListener('focus', () => {
                this._wrapper.classList.add('focused');
            });
            // ----------------------------------------------------------------------------------
            this._new_input_tag.addEventListener('blur', () => {
                this._wrapper.classList.remove('focused');
                this.add_tag(this._new_input_tag.value);
                this._new_input_tag.value = '';
            });
        },
        // --------------------------------------------------------------------------------------
        tags_from_input: function() {
            this._tags = this._input.value.split(/\s*,\s*/).filter(Boolean);
            this._tags.forEach(this._new_tag.bind(this));
        },
        // --------------------------------------------------------------------------------------
        _new_tag: function(name) {
            var close = ['a', {href: '#', 'class': 'close'}, ['\u00D7']];
            var li = create('li', {}, [['span', {}, [['span', {}, [name]], close]]]);
            this._ul.insertBefore(li, this._new_input_tag.parentNode);
        },
        // --------------------------------------------------------------------------------------
        add_tag: function(name) {
            name = (name + "").trim();
            if (name.length == 0) {
                return false;
            }
            if (!this._settings.allow_duplicates && this._tags.indexOf(name) !== -1) {
                return false;
            }
            this._new_tag(name)
            this._tags.push(name);
            this._update_input();
            this._new_input_tag.removeAttribute('placeholder');
            return true;
        },
        // --------------------------------------------------------------------------------------
        remove_tag: function(name) {
            let to_remove = [];
            for (let li of this._ul.children) {
                let span = li.querySelector("span span");
                if (span) {
                    let tag_name = span.innerText;
                    if (tag_name == name) {
                        to_remove.push(li);
                    }
                }
            }
            for (let li of to_remove) {
                this._ul.removeChild(li);
            }
            this._tags = this._tags.filter(function(tag) {
                return name !== tag;
            });
            if (this._tags.length == 0 && this._placeholder) {
                this._new_input_tag.setAttribute('placeholder', this._placeholder);
            }
            this._update_input();
        }
    };
    // ------------------------------------------------------------------------------------------
    return tagger;
});
