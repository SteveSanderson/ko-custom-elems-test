define(["knockout"], function(ko) {
	// Strictly speaking there's no need for this class, as you could just
	// work with the JSON data directly. However in most apps it's valuable
	// to have actual model classes where you can put behaviour.

    function Session(data) {
        this.id = data.id;
        this.title = ko.observable(data.title);
        this.speaker = ko.observable(data.speaker);
        this.description = ko.observable(data.description);
    }

    return Session;
});
