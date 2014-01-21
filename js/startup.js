requirejs.config({
    baseUrl: "",
    paths: {
        "text": "lib/require.text",
        "jquery": "lib/jquery-1.10.2",
        "knockout": "lib/knockout-3.0.0.debug",
        "knockout-components": "lib/knockout-components",
        "crossroads": "lib/crossroads/crossroads.min",
        "hasher": "lib/crossroads/hasher.min",
        "signals": "lib/crossroads/signals.min"
    }
});

define(["jquery", "knockout", "js/router", "lib/knockout-customElements"], function($, ko, router) {
    registerComponent("home-page");
    registerComponent("sessions-list");
    registerComponent("session-details");
    registerComponent("star-rating");

    // Start the application
    ko.applyBindings({ route: router.currentRoute });

    // Defines common URL conventions used by components in this site
    function registerComponent(name) {
        ko.components.register(name, {
            template: { require: "text!/components/" + name + "/" + name + ".html" },
            viewModel: { require: "components/" + name + "/" + name }
        });
    }
});
