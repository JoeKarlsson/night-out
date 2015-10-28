Template.finalLaunchList.helpers({
  allFinalTargets : function () {
    //console.log('allFinalTargets', Session.get('allFinalTargets'));
    return this.finalLaunches;
    //return Session.get('selectedLaunches');
  }
});
