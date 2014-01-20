(function(global, undefined) {


    function attachToKo(ko) {
        function ComponentInstance(name, elem, parentBindingContext, config, params, originalNodes) {
            var self = this;

            self._name = name;
            self._isDisposed = false;
            self._onDisposeCallbacks = [];
            self._getTemplateAndViewModelAsync(config, params, originalNodes, function(templateNameOrAnonymousTemplateContainer, viewModel) {
                if (self._isDisposed) {
                    return;
                }

                var bindingContext = parentBindingContext.createChildContext(viewModel),
                    renderTemplateOptions = {};
                self._templateSubscription = ko.renderTemplate(templateNameOrAnonymousTemplateContainer, bindingContext, renderTemplateOptions, elem, "replaceChildren");
            });
        }

        ComponentInstance.prototype._getTemplateAndViewModelAsync = function(config, params, originalNodes, callback) {
            var self = this;

            // TODO: Get both template and viewmodel in parallel instead of in series like this
            self._getTemplateAsync(config, function(templateNameOrAnonymousTemplateContainer) {
                self._getViewModelAsync(config, params, originalNodes, function(viewModel) {
                    callback(templateNameOrAnonymousTemplateContainer, viewModel);
                });
            });
        };

        ComponentInstance.prototype._getViewModelAsync = function(config, params, originalNodes, callback) {
            var viewModelProvider = config.viewModel,
                self = this,
                componentParameter = {
                    originalNodes: originalNodes,
                    onDispose: function(callback) {
                        self._onDisposeCallbacks.push(callback);
                    }
                };

            if (!viewModelProvider) {
                // Default viewmodel is just a name/value object containing the params
                callback(ko.utils.extend({
                    $childNodes: originalNodes
                }, params));
            } else {
                switch (typeof viewModelProvider) {
                    case "function":
                        // Provider function asynchronously returns the viewmodel
                        viewModelProvider(componentParameter, params, callback);
                        break;

                    case "string":
                        // Assume AMD module
                        if (typeof require === "function") {
                            require([viewModelProvider], function(module) {
                                var viewModelInstance;
                                if (typeof module === "function") {
                                    // Assume constructor taking the params
                                    viewModelInstance = new module(componentParameter, params);
                                } else if (typeof module === "object") {
                                    // Assume singleton
                                    viewModelInstance = module;
                                } else {
                                    throw new Error("When loading viewmodels via AMD, the module must be an object or a constructor function. Module: " + self._name);
                                }
                                callback(viewModelInstance);
                            });
                        } else {
                            throw new Error("Component viewmodel parameter may only be a string if you have an AMD module loader. Module: " + self._name);
                        }
                        break;

                    default:
                        throw new Error("Component viewmodel parameter should be a function that returns the viewmodel: " + this._name);
                }
            }
        };

        function markupToTemplateSourceNode(markupString) {
            var nodeArray = ko.utils.parseHtmlFragment(markupString),
                dummyContainer = document.createElement("div"), // Weird, but this is how anonymous template sources work
                templateSource = new ko.templateSources.anonymousTemplate(dummyContainer),
                anotherDummyContainer = document.createElement("div");
            ko.virtualElements.setDomNodeChildren(anotherDummyContainer, nodeArray);
            templateSource.nodes(anotherDummyContainer);
            return dummyContainer;
        }

        ComponentInstance.prototype._getTemplateAsync = function(config, callback) {
            var template = config.template || this._name;

            switch (typeof template) {
                case "string":
                    callback(template);
                    return;

                case "function":
                    template(function(markupString) {
                        var templateSourceNode = markupToTemplateSourceNode(markupString);
                            callback(templateSourceNode);
                    });
                    return;

                case "object":
                    if (template.require) {
                        require([template.require], function(markupString) {
                            var templateSourceNode = markupToTemplateSourceNode(markupString);
                            callback(templateSourceNode);
                        })
                        return;
                    }
            }
            
            throw new Error("Unrecognized template type for component: " + self._name);
        };

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
            componentConfigRegistry = {};
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
            }
        };

        var componentOriginalNodesDomDataKey = "__componentNodes__",
            componentInstanceDomDataKey = "__componentInstance__";
        ko.bindingHandlers.component = {
            init: function(elem) {
                // Extract original child nodes so we can use them later as a parameter
                // TODO: Consider supporting some kind of "preloadTemplate" option to be
                // injected until the view/viewmodel are ready.
                var originalChildNodes = extractNodeChildrenToNodeArray(elem);
                ko.utils.domData.set(elem, componentOriginalNodesDomDataKey, originalChildNodes);
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

                var componentConfig = componentConfigRegistry[componentName],
                    originalChildNodes = ko.utils.domData.get(elem, componentOriginalNodesDomDataKey),
                    previousComponentInstance = ko.utils.domData.get(elem, componentInstanceDomDataKey);

                if (!componentConfig) {
                    throw new Error("Unknown component: " + componentName);
                }

                if (previousComponentInstance) {
                    previousComponentInstance.dispose();
                }

                var componentInstance = new ComponentInstance(componentName, elem, bindingContext, componentConfig, componentData, originalChildNodes);
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