Template.setNightOut.events({
  'click #finalizePlanButton' : function (event) {
    event.preventDefault();

    var allSelectedLaunches = Session.get('selectedLaunches');
    var latLng = Session.get('latLng');
;
    var resultId = Plans.insert({ finalLaunches : allSelectedLaunches, currentLocation :  latLng });

    //When saved - redirect to next screen
    //var resultId = Plans.insert({ test : 'foo' });
    Router.go('finalizePlan', { _id : resultId });
  }
});