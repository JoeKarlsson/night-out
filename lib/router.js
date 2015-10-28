Router.configure({
  layoutTemplate : 'layout',
  loadingTemplate : 'loading',
  notFoundTemplate : 'notFound'
});

Router.route('/', { name : 'setNightOut' });

// Router.route('/uber', { name : 'uber' });

// Router.route('/plan/:_id', {
//   name: 'setNightOut',
//   data: function () {
//     return Plans.findOne(this.params._id);
//   }
// });

// Router.route('/plan/:_id/select', {
//   name: 'selectPosition'
// });

// Router.route('/plan/:_id/targets', {
//   name: 'selectTargets',
//   data: function () {
//     return Launches.findOne(this.params._id);
//   }
// });

// Router.route('/plan/:_id/setTime', {
//   name: 'setTimeTemplate',
//   data: function() {
//     return Launches.findOne(this.params._id);
//   }
// });

Router.route('/launch/:_id', {
 name: 'finalizePlan',
 data: function() {
  return Plans.findOne(this.params._id);
 }
});