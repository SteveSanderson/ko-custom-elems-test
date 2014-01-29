define(["knockout"], function(ko) {
    function HomePageViewModel(params) {
    }

    HomePageViewModel.prototype.dispose = function() {
    	console.log("Home page is being torn down.");
    }

    return HomePageViewModel;
});