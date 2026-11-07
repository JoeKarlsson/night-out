// The demo's map before MapLibre loads: a pre-rendered image of the demo
// view with the dots drawn on top in CSS. It costs one small image instead of
// a megabyte of map engine, so the first visit stays fast on phones. It has
// the same showPlaces/setSelected/resize shape as the live map.

import { DEMO_VIEW } from './default-bars.js';

const TILE = 512;

/** Web Mercator pixel offset of [lat, lng] from the view center, at the view's zoom. */
export function offsetFromCenter([lat, lng], view = DEMO_VIEW) {
  const world = TILE * 2 ** view.zoom;
  const x = (lngDeg) => ((lngDeg + 180) / 360) * world;
  const y = (latDeg) => {
    const s = Math.sin((latDeg * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
  };
  return [x(lng) - x(view.center[1]), y(lat) - y(view.center[0])];
}

// index.html ships the demo map inside #pick-map; keep a copy before any
// script touches it, for the vote map and for coming back to the demo
const MARKUP = document.getElementById('pick-map')?.innerHTML ?? '';

export function createStaticMap(container) {
  if (!container.querySelector('.static-map')) container.innerHTML = MARKUP;
  const dots = container.querySelector('.static-map-dots');

  const markers = new Map();
  function dot(className, latLng) {
    const el = document.createElement('div');
    el.className = `map-dot ${className}`;
    el.setAttribute('aria-hidden', 'true');
    const [dx, dy] = offsetFromCenter(latLng);
    el.style.left = `calc(50% + ${dx.toFixed(1)}px)`;
    el.style.top = `calc(50% + ${dy.toFixed(1)}px)`;
    dots.append(el);
    return el;
  }

  return {
    showPlaces(center, places, highlighted = new Set()) {
      dots.replaceChildren();
      markers.clear();
      dot('map-dot-you', center);
      for (const place of places) {
        markers.set(place.id, dot(highlighted.has(place.id) ? 'map-dot-bar is-selected' : 'map-dot-bar', [place.lat, place.lng]));
      }
    },
    setSelected(id, selected) {
      markers.get(id)?.classList.toggle('is-selected', selected);
    },
    resize() {},
  };
}
