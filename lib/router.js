Router.configure({
  layoutTemplate : 'layout',
  loadingTemplate : 'loading',
  notFoundTemplate : 'notFound'
});

Router.route('/', { name : 'setNightOut' });

Router.route('/launch/:_id', {
 name: 'finalizePlan',
 data: function() {
  return Plans.findOne(this.params._id);
 }
});
