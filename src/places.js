// Finding bars: OpenStreetMap data through the public Overpass API, with a
// made-up demo list when Overpass can't be reached.

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const SEARCH_RADIUS_METERS = 2600;
const MAX_RESULTS = 30;

const KIND_LABELS = { bar: 'Bar', pub: 'Pub', biergarten: 'Beer garden', brewery: 'Brewery' };

export function overpassQuery(lat, lng, radius = SEARCH_RADIUS_METERS) {
  const around = `around:${radius},${lat},${lng}`;
  return `[out:json][timeout:20];(nwr["amenity"~"^(bar|pub|biergarten)$"]["name"](${around});nwr["craft"="brewery"]["name"](${around}););out center 80;`;
}

/** Turn an Overpass response into places sorted by distance from `center`. */
export function parseOverpass(json, center) {
  const seen = new Set();
  const places = [];
  for (const el of json?.elements ?? []) {
    const name = el.tags?.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `${el.type[0]}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = el.tags.craft === 'brewery' ? 'brewery' : el.tags.amenity;
    places.push({ id, name, lat, lng, kind: KIND_LABELS[kind] ?? 'Bar', distance: distanceMeters(center, [lat, lng]) });
  }
  return places.sort((a, b) => a.distance - b.distance).slice(0, MAX_RESULTS);
}

export async function fetchNearbyBars(center, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    body: new URLSearchParams({ data: overpassQuery(center[0], center[1]) }),
    signal,
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status}`);
  return parseOverpass(await response.json(), center);
}

// Fictional bars placed around whatever center the visitor has, used when
// Overpass is down or rate-limits us. Offsets are meters north and east.
const DEMO_BARS = [
  ['The Last Call', 180, -120, 'Bar'],
  ['Moonlight Tap Room', -260, 210, 'Brewery'],
  ['Pink Flamingo Lounge', 420, 330, 'Bar'],
  ['The Rusty Anchor', -520, -380, 'Pub'],
  ['Neon Hops', 650, -560, 'Brewery'],
  ['Corner Booth', -150, 720, 'Pub'],
  ['Night Owl Beer Garden', 880, 140, 'Beer garden'],
  ['Jukebox Social Club', -900, -60, 'Bar'],
];

export function demoBars(center) {
  return DEMO_BARS.map(([name, north, east, kind], i) => {
    const lat = center[0] + north / 111320;
    const lng = center[1] + east / (111320 * Math.cos((center[0] * Math.PI) / 180));
    return { id: `demo${i}`, name, lat, lng, kind, distance: distanceMeters(center, [lat, lng]) };
  }).sort((a, b) => a.distance - b.distance);
}

export function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

/** "450 ft" under a tenth of a mile, otherwise "1.2 mi". */
export function formatDistance(meters) {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084 / 10) * 10} ft`;
  return `${miles.toFixed(1)} mi`;
}
