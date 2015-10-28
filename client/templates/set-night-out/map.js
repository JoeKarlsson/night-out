//Global variable for setting default zoom in google maps
var MAP_ZOOM = 15;
var results;

//When app starts load google maps
Meteor.startup(function() {
  GoogleMaps.load({ v : '3', key : 'AIzaSyAG_bYopvQf3H2lrQBNfKJyo4fic2ETdFI', libraries : 'geometry,places' });
});

//Pull latitude and longitude from google maps api and return location zoom
Template.map.helpers({
  //If there is an error finding the current users geoloaction - spit out error to the DOM
  geolocationError : function() {
    var error = Geolocation.error();
    return error && error.message;
  },

  //Set out map options
  mapOptions : function() {
    var latLng = Geolocation.latLng();
    Session.set('latLng', latLng);

    //Initialize the map once we  have the latLng.
    if (GoogleMaps.loaded() && latLng) {
      return {
        center : new google.maps.LatLng(latLng.lat, latLng.lng),
        zoom : MAP_ZOOM,
        // This is where you would paste any style found on Snazzy Maps.
        styles: [{"featureType":"landscape","stylers":[{"saturation":-100},{"lightness":65},{"visibility":"on"}]},{"featureType":"poi","stylers":[{"saturation":-100},{"lightness":51},{"visibility":"simplified"}]},{"featureType":"road.highway","stylers":[{"saturation":-100},{"visibility":"simplified"}]},{"featureType":"road.arterial","stylers":[{"saturation":-100},{"lightness":30},{"visibility":"on"}]},{"featureType":"road.local","stylers":[{"saturation":-100},{"lightness":40},{"visibility":"on"}]},{"featureType":"transit","stylers":[{"saturation":-100},{"visibility":"simplified"}]},{"featureType":"administrative.province","stylers":[{"visibility":"off"}]},{"featureType":"water","elementType":"labels","stylers":[{"visibility":"on"},{"lightness":-25},{"saturation":-100}]},{"featureType":"water","elementType":"geometry","stylers":[{"hue":"#ffff00"},{"lightness":-25},{"saturation":-97}]}]
      };
    }
  },
  allTargets : function () {
    return Session.get('allTargets');
  }
});

//Create google maps marker for current location
Template.map.onCreated(function() {
  var self = this;

  GoogleMaps.ready('map', function(map) {
    //get lat and long from current location
    //IDEA: after getting the current location - save to a session variable so we can use and reuse it.
    var latLng = Geolocation.latLng();

    //variable within scope that sets current location
    var currentPost = new google.maps.LatLng(latLng.lat, latLng.lng);

    //variable that creates a new instance of marker information display
    var infowindow = new google.maps.InfoWindow();

     //Gold star SVG to mark current location
    var goldStar = {
    path: 'M 125,5 155,90 245,90 175,145 200,230 125,180 50,230 75,145 5,90 95,90 z',
    fillColor: 'yellow',
    fillOpacity: 0.8,
    scale: .25,
    strokeColor: 'gold',
    strokeWeight: 5
  };

    //drop marker on current location
    var marker = new google.maps.Marker({
      position : currentPost,
      map : map.instance,
      icon: goldStar,
      animation : google.maps.Animation.DROP
    });

    var infoWindowContent =
        '<h5>You are here</h5>';

    //event listener that loads resturant information into infowindow.
    google.maps.event.addListener(marker, 'click', function() {
      infowindow.setContent(infoWindowContent);
      infowindow.open(map.instance, this);
    });

    //get surrounding restaurants within radius
    //call on the document of food which is an array of objects
    var service = new google.maps.places.PlacesService(map.instance);
    service.nearbySearch({
      location : currentPost,
      radius : 2300,
      types : ['bar']
    }, callback);

    //Error checking to check for status of query
    function callback(results, status) {
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        //console.log('targets', targets);

        var targets = results.map(function (target) {
          console.log('target', target);
          createMarker(target);
          var targetDetail = {
            name : target.name,
            placeId : target.place_id,
            include : false,
            location : target.geometry.location,
            icon : target.icon,
            vicinity : target.vicinity,
            rating : target.rating,
            votes : 0,
            currentLocation : latLng,
            planId : 0
          };
          return targetDetail;
        });
        Session.set('allTargets', targets);
      }
    }

    //create marker for all restaurant locations within radius
    function createMarker(place) {
      var placeLoc = place.geometry.location;
      var marker = new google.maps.Marker({
        map : map.instance,
        position : placeLoc,
        draggable : false,
        icon : place.icon,
        animation : google.maps.Animation.DROP
      });

      var infoWindowContent =
        '<h5>' + place.name + '</h5>';

      //event listener that loads resturant information into infowindow.
      google.maps.event.addListener(marker, 'click', function() {
        if (marker.getAnimation() !== null) {
            marker.setAnimation(null);
          } else {
            marker.setAnimation(google.maps.Animation.BOUNCE);
          }
        infowindow.setContent(infoWindowContent);
        infowindow.open(map.instance, this);
      });
      return marker;
    }
  });
});
