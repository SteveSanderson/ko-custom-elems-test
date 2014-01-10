define(["module", "knockout", "js/sessionRepository"], function(module, ko, sessionRepository) {
    // Components may register further components of their own
    // This one is just an HTML partial with no viewmodel
    ko.components.register("session-info", {
        templateUrl: ko.components.relativeUrl(module.uri, "session-summary.html")
    });

    function SessionsListViewModel(component, params) {
        this.sessions = ko.observableArray();

        // Populate the array asynchronously via Ajax
        sessionRepository.getAllSessions().then(this.sessions);
    }

    return SessionsListViewModel;
});