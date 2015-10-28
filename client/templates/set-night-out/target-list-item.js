var selectCount = 0;
var selectedLaunches = [];

//Selecting Launch Target on the list
Template.targetListItem.events({
  'click .collection-item' : function (event, template) {
    this.include = !this.include;
    var scb = template.$('.styled-checkbox');

    //If the box is unchecked, add the restaurant to our array
    if (this.include) {
      selectCount++;
      scb.addClass('checked');
      this.votes = 0;
      selectedLaunches.push(this);
      Session.set('selectedLaunches', selectedLaunches);
      Materialize.toast('Selected ' + this.name, 4000) // 4000 is the duration of the toast
    } else { //If it has already been selected - remove it from the array
      selectCount--;
      scb.removeClass('checked');

      //find the index of the object we want to remove
      var index = selectedLaunches.indexOf(this);

      //Then remove it with splice
      if (index > -1) {
        selectedLaunches.splice(index, 1);
      }

    }
  }
});