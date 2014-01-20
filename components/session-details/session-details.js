define(["module", "knockout", "js/router", "js/sessionRepository"], function(module, ko, router, sessionRepository) {
    // Components may register further components of their own
    // This one is just an HTML partial with no viewmodel
    ko.components.register("other-sessions", {
        template: { require: "text!" + ko.components.relativeUrl(module.uri, "other-sessions.html") }
    });

    function SessionDetailsViewModel(component, params) {
        this.currentSession = ko.observable();
        this.otherSessions = ko.observableArray();

        // Load the "other sessions" list just once when this component is instantiated
        sessionRepository.getAllSessions().then(this.otherSessions);

        // Load the "current session" whenever the sessionId route parameter changes
        var sessionLoader = ko.computed(function () {
            this.currentSession(null); // Show "loading" until fetched
            sessionRepository
                .getSession(params.route().sessionId)
                .then(this.currentSession);
        }, this);

        // Stop reacting to URL changes when this component is disposed
        component.onDispose(sessionLoader);
    }

    return SessionDetailsViewModel;
});
