var finalTargets;
var MAP_ZOOM = 14;
var results;

// Template.finalizePlan.helpers({
//   getAllFinalTargets : function () {
//     // // console.log(Session.get('allTargets'));
//     finalTargets = this.finalLaunches;
//     //return finalTargets;
//     console.log(finalTargets);
//     return Session.set('allFinalTargets', finalTargets);
//   }
// });

Template.finalizePlan.helpers({
  getAllFinalTargets : function () {
    finalTargets = this.finalLaunches;
    return Session.set('selectedLaunches', finalTargets);
  }
});



//Pull latitude and longitude from google maps api and return location zoom
Template.finalizePlan.helpers({
  //If there is an error finding the current users geoloaction - spit out error to the DOM
  geolocationError : function() {
    var error = Geolocation.error();
    return error && error.message;
  },

  //Set out map options
  mapOptions : function() {
    var latLng = Geolocation.latLng();

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
    //console.log(Session.get('allTargets'));
    return Session.get('allTargets');
  }
});

//Create google maps marker for current location
Template.finalizePlan.onCreated(function() {
  var self = this;

  GoogleMaps.ready('map', function(map) {
    //get lat and long from current location
    var latLng = Geolocation.latLng();
    //console.log('latlng', latLng);

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

    setMarkers(finalTargets);

    function setMarkers(places) {
      for (var i = 0; i < places.length; i++) {
        //console.log('places', places[i]);
        createMarker(places[i]);
      }
    }

    //create marker for all restaurant locations within radius
    function createMarker(place) {

      var placeLoc = {
        lat : place.location.G,
        lng : place.location.K
      };

      //console.log('placeLoc', placeLoc);
      var marker = new google.maps.Marker({
        map : map.instance,
        position : placeLoc,
        draggable : false,
        icon : place.icon,
        animation : google.maps.Animation.DROP
      });

      var infoWindowContent =
        '<h3>' + place.name + '</h3><p> Votes: ' + place.votes + '</p>';

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
