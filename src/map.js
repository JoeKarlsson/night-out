// The live map: OpenFreeMap's "fiord" vector style drawn by MapLibre GL,
// loaded only when a live map is needed (see static-map.js for the demo's).

import { MAP_STYLE_URL } from './map-style.js';

let maplibrePromise;
function loadMapLibre() {
  maplibrePromise ??= Promise.all([
    import('maplibre-gl'),
    // MapLibre 6 looks for its worker next to its own file, which a bundle
    // moves, so ship the worker as an asset and point MapLibre at it.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]).then(([m, worker]) => {
    const maplibregl = m.default ?? m;
    maplibregl.setWorkerUrl(worker.default);
    return maplibregl;
  });
  return maplibrePromise;
}

function dot(className, label) {
  const el = document.createElement('div');
  el.className = `map-dot ${className}`;
  el.title = label;
  // The list next to the map is the accessible version, so dots stay out of it
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * Make a map in `container`. Returns { showPlaces, setSelected, resize }, or
 * throws when MapLibre can't start (no WebGL); the caller says so on the page.
 */
export async function createMap(container) {
  const maplibregl = await loadMapLibre();
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLE_URL,
    center: [-157.8625, 21.3115],
    zoom: 13,
    // Ctrl/Cmd + wheel to zoom and two fingers to pan, so the page still scrolls
    cooperativeGestures: true,
    attributionControl: { compact: false },
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  map.touchZoomRotate.disableRotation();

  let markers = new Map();

  /** Draw `you` and the places; fit the view to the places (and you, when `withCenter`). */
  function showPlaces(center, places, highlighted = new Set(), { fit = true, withCenter = true } = {}) {
    for (const m of markers.values()) m.remove();
    markers = new Map();
    const you = new maplibregl.Marker({ element: dot('map-dot-you', 'You') }).setLngLat([center[1], center[0]]).addTo(map);
    markers.set('you', you);
    for (const place of places) {
      const el = dot(highlighted.has(place.id) ? 'map-dot-bar is-selected' : 'map-dot-bar', place.name);
      markers.set(place.id, new maplibregl.Marker({ element: el }).setLngLat([place.lng, place.lat]).addTo(map));
    }
    if (!fit) return;
    const points = [...(withCenter ? [center] : []), ...places.slice(0, 12).map((p) => [p.lat, p.lng])];
    map.resize();
    if (points.length === 1) {
      map.jumpTo({ center: [center[1], center[0]], zoom: 15 });
    } else {
      const bounds = new maplibregl.LngLatBounds();
      for (const [lat, lng] of points) bounds.extend([lng, lat]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 0 });
    }
  }

  function setSelected(id, selected) {
    markers.get(id)?.getElement().classList.toggle('is-selected', selected);
  }

  return { showPlaces, setSelected, resize: () => map.resize() };
}
