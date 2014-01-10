define(["knockout", "js/models/session"], function(ko, Session) {

    return {
        getAllSessions: function() {
            return $.getJSON("/server/api/sessions").then(function(array) {
                return ko.utils.arrayMap(array, function (data) { return new Session(data); });
            });
        },
        getSession: function(id) {
            // A real server would support queries by ID (and other parameters). Fake it.
            return this.getAllSessions().then(function(allSessions) {
                return ko.utils.arrayFirst(allSessions, function(session) { return session.id === id; });
            });
        }
    }
});
