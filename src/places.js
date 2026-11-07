// Finding bars: OpenStreetMap data through the public Overpass API, then
// OSM's Nominatim search when Overpass is down (it often is), then a made-up
// demo list when neither answers.

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const SEARCH_RADIUS_METERS = 2600;
const MAX_RESULTS = 30;
const OVERPASS_TIMEOUT_MS = 6000;
const NOMINATIM_TIMEOUT_MS = 8000;
// Nominatim's usage policy allows one request a second
const NOMINATIM_GAP_MS = 1100;
const NOMINATIM_PHRASES = ['bar', 'pub', 'brewery'];

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
    const kind = el.tags.craft === 'brewery' ? 'Brewery' : KIND_LABELS[el.tags.amenity] ?? 'Bar';
    places.push({ id, name, lat, lng, kind, distance: distanceMeters(center, [lat, lng]) });
  }
  return places.sort((a, b) => a.distance - b.distance).slice(0, MAX_RESULTS);
}

function kindOf(category, type) {
  return category === 'craft' && type === 'brewery' ? 'Brewery' : KIND_LABELS[type] ?? 'Bar';
}

/** Box around `center` for Nominatim's viewbox: "west,north,east,south". */
export function viewbox([lat, lng], radius = SEARCH_RADIUS_METERS) {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(',');
}

export function nominatimUrl(phrase, center) {
  const params = new URLSearchParams({ q: phrase, format: 'jsonv2', limit: '40', bounded: '1', viewbox: viewbox(center) });
  return `${NOMINATIM_URL}?${params}`;
}

/** Turn Nominatim results into places, keeping only bars, pubs, beer gardens and breweries. */
export function parseNominatim(results, center, seen = new Set()) {
  const places = [];
  for (const r of results ?? []) {
    const isBar = r.category === 'amenity' && Object.hasOwn(KIND_LABELS, r.type);
    const isBrewery = r.category === 'craft' && r.type === 'brewery';
    const name = r.name?.trim();
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if ((!isBar && !isBrewery) || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `${r.osm_type?.[0] ?? 'x'}${r.osm_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    places.push({ id, name, lat, lng, kind: kindOf(r.category, r.type), distance: distanceMeters(center, [lat, lng]) });
  }
  return places;
}

async function getJson(fetchImpl, url, init, timeoutMs) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

export async function fetchFromOverpass(center, { fetchImpl = fetch } = {}) {
  const body = new URLSearchParams({ data: overpassQuery(center[0], center[1]) });
  return parseOverpass(await getJson(fetchImpl, OVERPASS_URL, { method: 'POST', body }, OVERPASS_TIMEOUT_MS), center);
}

export async function fetchFromNominatim(center, { fetchImpl = fetch, wait = sleep } = {}) {
  const seen = new Set();
  const places = [];
  for (const [i, phrase] of NOMINATIM_PHRASES.entries()) {
    if (i > 0) await wait(NOMINATIM_GAP_MS);
    places.push(...parseNominatim(await getJson(fetchImpl, nominatimUrl(phrase, center), {}, NOMINATIM_TIMEOUT_MS), center, seen));
  }
  return places.sort((a, b) => a.distance - b.distance).slice(0, MAX_RESULTS);
}

/**
 * Real bars near `center`: Overpass first, Nominatim if Overpass fails.
 * An empty answer is an answer; only errors move on to the next source.
 * Throws an AggregateError when both fail.
 */
export async function fetchNearbyBars(center, options = {}) {
  const errors = [];
  for (const source of [fetchFromOverpass, fetchFromNominatim]) {
    try {
      return await source(center, options);
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, 'No OpenStreetMap search answered');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
