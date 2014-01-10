define(["knockout"], function(ko) {
    function HomePageViewModel(component, params) {
    	// You can also pass observables/subscriptions to component.onDispose
    	// to get them cleared up when the component goes away.
    	component.onDispose(function() {
    		console.log("Home page is being torn down.");
    	});
    }

    return HomePageViewModel;
});