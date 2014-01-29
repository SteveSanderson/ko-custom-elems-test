(function(global, undefined) {


    function attachToKo(ko) {

        function ComponentInstance(name, elem, parentBindingContext, params, originalNodes) {
            var self = this;

            self._name = name;
            self._isDisposed = false;
            self._onDisposeCallbacks = [];

            ko.components.get(name, function(result) {
                if (self._isDisposed) {
                    return;
                }

                if (!result.template) {
                    throw new Error("Component has no template: " + name);
                }

                var componentParameter = {
                        originalNodes: originalNodes,
                        onDispose: function(callback) {
                            self._onDisposeCallbacks.push(callback);
                        }
                    },
                    viewModel = result.viewModelConstructor ? new result.viewModelConstructor(componentParameter, params) : ko.utils.extend({}, params),
                    bindingContext = parentBindingContext.createChildContext(viewModel),
                    renderTemplateOptions = {},
                    templateSourceNode = nodeArrayToTemplateSourceNode(result.template);

                self._templateSubscription = ko.renderTemplate(templateSourceNode, bindingContext, renderTemplateOptions, elem, "replaceChildren");
            });
        }

        function nodeArrayToTemplateSourceNode(nodeArray) {
            var dummyContainer = document.createElement("div"), // Weird, but this is how anonymous template sources work
                templateSource = new ko.templateSources.anonymousTemplate(dummyContainer),
                anotherDummyContainer = document.createElement("div");
            ko.virtualElements.setDomNodeChildren(anotherDummyContainer, nodeArray);
            templateSource.nodes(anotherDummyContainer);
            return dummyContainer;
        }

        ComponentInstance.prototype.dispose = function() {
            this._templateSubscription.dispose();
            this._isDisposed = true;

            ko.utils.arrayForEach(this._onDisposeCallbacks, function(value) {
                if (value) {
                    if (ko.isComputed(value) || typeof value.dispose === "function") {
                        value.dispose();
                    } else if (typeof value === "function") {
                        value();
                    }
                }
            });
        };

        var originalDocumentCreateDocumentFragment,
            componentConfigRegistry = {},
            loadedComponents = {},
            loadingComponents = {},
            defaultComponentLoader = {
                getConfig: function(name, callback) {
                    var config = componentConfigRegistry[name];
                    config ? callback(config) : callback();
                },
                loadTemplate: function(name, config, callback) {
                    config = config && config.template;
                    if (!config) {
                        throw new Error("Component has no template configured: " + name);
                    } else if (typeof config === "function") {
                        config(callback);
                    } else if (config.element) {
                        var elem = document.getElementById(config.element);
                        if (!elem) {
                            throw new Error("Component " + name + " references unknown element " + config.element);
                        }
                        callback(elem.childNodes);
                    } else if (config.provider) {
                        config.provider(function(markupOrNodeArray) {
                            if (typeof markupOrNodeArray === "string") {
                                callback(ko.utils.parseHtmlFragment(markupOrNodeArray));
                            } else if (markupOrNodeArray instanceof Array) {
                                callback(markupOrNodeArray);
                            } else {
                                throw new Error("Component " + name + "'s template provider supplied invalid data. Supply either a markup string or an array of DOM nodes.");
                            }
                        });
                    } else if (config.require) {
                        defaultComponentLoader.loadTemplate(name, {
                            template: {
                                provider: function(callback) {
                                    require([config.require], callback);
                                }
                            }
                        }, callback);
                    } else {
                        callback();
                    }
                },
                loadViewModel: function(name, config, callback) {
                    config = config && config.viewModel;
                    if (!config) {
                        callback(null);
                    } else if (typeof config === "function") {
                        config(callback);
                    } else if (config.provider) {
                        config.provider(callback);
                    } else if (config.instance) {
                        callback(function() { return config.instance; });
                    } else if (config.hasOwnProperty('constructor')) {
                        callback(config.constructor);
                    } else if (config.require) {
                        require([config.require], function(instanceOrConstructor) {
                            if (typeof instanceOrConstructor === "function") {
                                callback(instanceOrConstructor);
                            } else if (typeof instanceOrConstructor.create === "function") {
                                callback(instanceOrConstructor.create);
                            } else {
                                throw new Error("Required module is not a function, and does not have a 'create' function. Component: " + name);
                            }
                        });
                    }     
                } 
            };

        ko.components = {
            register: function(name, options) {
                options = options || {};

                name = name.toLowerCase();
                componentConfigRegistry[name] = options;

                // Just in case you're going to use the Custom Elements feature with this component,
                // and you're on IE < 9, and not using jQuery.
                document.createElement(name);
            },
            isRegistered: function(name) {
                return !!componentConfigRegistry[name.toLowerCase()];
            },
            relativeUrl: function(base, url) {
                // Convenience helper especially useful when working with require.js
                return base.replace(/\/[^\/]+$/, "/" + url);
            },
            enableCustomElementsOnOldIEIfNeeded: function() {
                // To enable custom elements on old IE, we have to call document.createElement(name)
                // on every document fragment that ever gets created. This is especially important
                // if you're also using jQuery, because its parseHTML code works by setting .innerHTML
                // on some element inside a temporary document fragment.
                // It would be nicer if jQuery exposed some API for registering custom element names,
                // but it doesn't.
                if (oldIeVersion < 9 && !originalDocumentCreateDocumentFragment) {
                    originalDocumentCreateDocumentFragment = document.createDocumentFragment;
                    document.createDocumentFragment = function() {
                        // Note that you *can't* do originalDocumentCreateDocumentFragment.apply(this, arguments)
                        // because IE6/7 complain "object doesn't support this method". Fortunately the function
                        // doesn't take any parameters, and doesn't need a "this" value.
                        var docFrag = originalDocumentCreateDocumentFragment();
                        if (docFrag.createElement) {
                            for (var componentName in componentConfigRegistry) {
                                if (componentConfigRegistry.hasOwnProperty(componentName)) {
                                    docFrag.createElement(componentName);
                                }
                            }
                        }
                        return docFrag;
                    };
                }
            },

            get: function(name, callback) {
                if (loadedComponents[name]) {
                    callback(loadedComponents[name]);
                } else if (loadingComponents[name]) {
                    loadingComponents[name].subscribe(callback);
                } else {
                    var subscribable = loadingComponents[name] = new ko.subscribable();
                    subscribable.subscribe(callback);

                    ko.components._load(name, function(result) {
                        loadedComponents[name] = result;
                        delete loadingComponents[name];
                        subscribable.notifySubscribers(result);
                    });    
                }
            },

            loaders: [defaultComponentLoader],

            _load: function(name, callback) {
                getFirstLoaderResult(ko.components.loaders.slice(0), "getConfig", [name], function(config) {
                    if (!config) {
                        throw new Error("Unknown component: " + name);
                    }

                    // Run the two loaders simultaneously. Could generalise to > 2, but this is sufficient here.
                    var loadedTemplate = undefined,
                        loadedViewModelConstructor = undefined;
                    getFirstLoaderResult(ko.components.loaders.slice(0), "loadTemplate", [name, config], function(template) {
                        if (loadedViewModelConstructor !== undefined) {
                            callback({ template: template, viewModelConstructor: loadedViewModelConstructor });
                        } else {
                            loadedTemplate = template;
                        }
                    });
                    getFirstLoaderResult(ko.components.loaders.slice(0), "loadViewModel", [name, config], function(viewModelConstructor) {
                        if (loadedTemplate !== undefined) {
                            callback({ template: loadedTemplate, viewModelConstructor: viewModelConstructor });
                        } else {
                            loadedViewModelConstructor = viewModelConstructor;
                        }
                    })
                });
            }
        };

        function getFirstLoaderResult(loaders, methodName, args, callback) {
            var nextMethod;
            while (!nextMethod) {
                if (!loaders.length) {
                    callback(null);
                    return;
                }
                nextMethod = loaders.pop()[methodName];
            }

            nextMethod.apply(null, args.concat(function(result) {
                if (arguments.length === 0) {
                    getFirstLoaderResult(loaders, methodName, args, callback);
                } else {
                    callback(result);
                }
            }));
        }

        var componentOriginalNodesDomDataKey = "__componentNodes__",
            componentInstanceDomDataKey = "__componentInstance__";
        ko.bindingHandlers.component = {
            init: function(elem) {
                // Extract original child nodes so we can use them later as a parameter
                // TODO: Consider supporting some kind of "preloadTemplate" option to be
                // injected until the view/viewmodel are ready.
                var originalChildNodes = extractNodeChildrenToNodeArray(elem);
                ko.utils.domData.set(elem, componentOriginalNodesDomDataKey, originalChildNodes);

                ko.utils.domNodeDisposal.addDisposeCallback(elem, function() {
                    var currentComponentInstance = ko.utils.domData.get(elem, componentInstanceDomDataKey);
                    currentComponentInstance.dispose();
                });

                return {
                    controlsDescendantBindings: true
                };
            },
            update: function(elem, valueAccessor, allBindings, viewModel, bindingContext) {
                var value = valueAccessor(),
                    componentName = value.name.toLowerCase(),
                    componentData = value.data;

                if (componentName === "ko-component") {
                    if (!componentData.name) {
                        throw new Error("When using <ko-component>, you must supply a 'name' attribute.");
                    }
                    componentName = ko.unwrap(componentData.name);
                }

                var originalChildNodes = ko.utils.domData.get(elem, componentOriginalNodesDomDataKey),
                    previousComponentInstance = ko.utils.domData.get(elem, componentInstanceDomDataKey);

                if (previousComponentInstance) {
                    previousComponentInstance.dispose();
                }

                var componentInstance = new ComponentInstance(componentName, elem, bindingContext, componentData, originalChildNodes);
                ko.utils.domData.set(elem, componentInstanceDomDataKey, componentInstance);
            }
        };
        ko.virtualElements.allowedBindings.component = true;

        function extractNodeChildrenToNodeArray(node) {
            var result = [],
                childNodes = ko.virtualElements.childNodes(node),
                current;
            for (var i = 0; current = childNodes[i]; i++) {
                result.push(current);
            }
            for (var i = 0; current = result[i]; i++) {
                current.parentNode.removeChild(current);
            }

            return result;
        }

        ko.bindingHandlers.bindNodes = {
            init: function(elem, valueAccessor, allBindings, viewModel, bindingContext) {
                var config = valueAccessor(),
                    nodes = config.nodes;
                if (config.clone) {
                    throw new Error("Not implemented: cloning");
                }

                ko.virtualElements.setDomNodeChildren(elem, nodes);
                ko.applyBindingsToDescendants(config.bindingContext, elem);
                return {
                    controlsDescendantBindings: true
                };
            }
        }
        ko.virtualElements.allowedBindings.bindNodes = true;

        ko.bindingHandlers.stopBinding = {
            init: function(elem, valueAccessor) {
                if (valueAccessor() !== false) {
                    return {
                        controlsDescendantBindings: true
                    };
                }
            }
        }
        ko.virtualElements.allowedBindings.stopBinding = true;

        // This component is treated as a special case in the binding handler
        ko.components.register("ko-component", {});
    }

    // Share same logic as KO to ensure we have a consistent view of IE version
    var oldIeVersion = document && (function() {
        var version = 3,
            div = document.createElement('div'),
            iElems = div.getElementsByTagName('i');

        // Keep constructing conditional HTML blocks until we hit one that resolves to an empty fragment
        while (
            div.innerHTML = '<!--[if gt IE ' + (++version) + ']><i></i><![endif]-->',
            iElems[0]
        ) {}
        return version > 4 ? version : undefined;
    }());

    // Determines which module loading scenario we're in, grabs dependencies, and attaches to KO
    function prepareExports() {
        if (typeof define === 'function' && define.amd) {
            // AMD anonymous module
            define(["knockout"], attachToKo);
        } else if ('ko' in global) {
            // Non-module case - attach to the global instance
            attachToKo(global.ko);
        } else {
            throw new Error('Couldn\'t find an instance of ko to attach to');
        }
    }

    prepareExports();
})();