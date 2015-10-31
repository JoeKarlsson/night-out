Meteor.publish('plans', function() {
  return Plans.find();
});