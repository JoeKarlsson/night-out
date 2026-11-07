// Real bars around Honolulu's Chinatown, where Night Out was first built,
// from OpenStreetMap (© OpenStreetMap contributors, ODbL) via Nominatim on
// 2026-11-07. The default location shows these straight away, with no
// network, for the autoplay demo and when someone's location doesn't come.

import { distanceMeters } from './places.js';

export const DEFAULT_CENTER = [21.3115, -157.8625];

// The autoplay demo picks these three, a few blocks apart
export const DEMO_PICKS = ['n14190542467', 'n6906469049', 'n6906510131'];

// The pre-rendered map behind the demo (public/demo-map-*.webp, made by
// `npm run demo-map`): centered between the picks, at a zoom that fits them.
// Phones get the small image; everything else the large one.
export const DEMO_VIEW = {
  center: [21.30999, -157.86298],
  zoom: 15.5,
  small: { width: 600, height: 520, maxWidth: 599 },
  large: { width: 900, height: 720 },
};

const BARS = [
  {id: "n6312124615", name: "Bar 35", lat: 21.31153, lng: -157.86248, kind: "Bar"},
  {id: "n11677564122", name: "Royal Arcade Bar", lat: 21.31161, lng: -157.86227, kind: "Bar"},
  {id: "n6899722487", name: "The Manifest", lat: 21.31155, lng: -157.8622, kind: "Bar"},
  {id: "n14190542467", name: "Black Orchid", lat: 21.31197, lng: -157.86235, kind: "Bar"},
  {id: "n6651547106", name: "The Dragon Upstairs", lat: 21.31099, lng: -157.8624, kind: "Bar"},
  {id: "n6906469049", name: "Black Shamrock Tavern", lat: 21.31041, lng: -157.86355, kind: "Pub"},
  {id: "n12001568886", name: "Murphy's Bar and Grill", lat: 21.31017, lng: -157.86352, kind: "Pub"},
  {id: "n6906510131", name: "Bar Leather Apron", lat: 21.30801, lng: -157.86364, kind: "Bar"},
  {id: "n14134352197", name: "Nalu Bar", lat: 21.30704, lng: -157.86631, kind: "Bar"},
  {id: "n14134368877", name: "Lē'ahi Brewing Company", lat: 21.30638, lng: -157.86534, kind: "Pub"},
  {id: "n7776272667", name: "ShinshoTei", lat: 21.31626, lng: -157.85524, kind: "Bar"},
];

export function defaultBars() {
  return BARS.map((bar) => ({ ...bar, distance: distanceMeters(DEFAULT_CENTER, [bar.lat, bar.lng]) })).sort((a, b) => a.distance - b.distance);
}
