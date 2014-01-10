define(["knockout", "crossroads", "hasher"], function(ko, crossroads, hasher) {
    var router = {
        currentRoute: ko.observable({}),
        routes: {
            home:           route('', { page: 'home-page' }),
            sessionsList:   route('sessions', { page: 'sessions-list' }),
            sessionDetails: route('sessions/{sessionId}', { page: 'session-details' })
        }
    };

    activateCrossroads();
    return router;

    function route(url, routeParams) {
        return crossroads.addRoute(url, function(requestParams) {
            router.currentRoute(ko.utils.extend(requestParams, routeParams));
        });
    }

    function activateCrossroads() {
        function parseHash(newHash, oldHash) { crossroads.parse(newHash); }
        crossroads.normalizeFn = crossroads.NORM_AS_OBJECT;
        hasher.initialized.add(parseHash);
        hasher.changed.add(parseHash);
        hasher.init();
    }
});