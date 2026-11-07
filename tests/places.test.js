import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOverpass, parseNominatim, demoBars, distanceMeters, formatDistance, overpassQuery, fetchNearbyBars,
  OVERPASS_URL, NOMINATIM_URL,
} from '../src/places.js';

const center = [44.9778, -93.265];

test('parseOverpass keeps named bars, uses way centers, dedupes and sorts by distance', () => {
  const json = {
    elements: [
      { type: 'node', id: 1, lat: 44.99, lon: -93.265, tags: { amenity: 'pub', name: 'Far Pub' } },
      { type: 'way', id: 2, center: { lat: 44.978, lon: -93.265 }, tags: { craft: 'brewery', name: ' Near Brewery ' } },
      { type: 'node', id: 3, lat: 44.98, lon: -93.265, tags: { amenity: 'bar' } },
      { type: 'node', id: 1, lat: 44.99, lon: -93.265, tags: { amenity: 'pub', name: 'Far Pub' } },
      { type: 'node', id: 4, tags: { amenity: 'bar', name: 'No coords' } },
    ],
  };
  const places = parseOverpass(json, center);
  assert.deepEqual(places.map((p) => [p.id, p.name, p.kind]), [
    ['w2', 'Near Brewery', 'Brewery'],
    ['n1', 'Far Pub', 'Pub'],
  ]);
  assert.deepEqual(parseOverpass({}, center), []);
});

const nominatimHit = (name, type, osm_id, category = 'amenity') =>
  ({ name, category, type, osm_type: 'node', osm_id, lat: '44.978', lon: '-93.265' });

// A fake fetch that answers each host from a table and records the calls
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url.startsWith(OVERPASS_URL) ? `overpass ${init.body.get('data') ? 'query' : ''}`.trim() : new URL(url).searchParams.get('q'));
    const answer = url.startsWith(OVERPASS_URL) ? answers.overpass : answers.nominatim?.(new URL(url).searchParams.get('q'));
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return { ok: false, status: answer };
    return { ok: true, json: async () => answer };
  };
  return { fetchImpl, calls, wait: async () => {} };
}

test('fetchNearbyBars uses Overpass when it answers, even with nothing found', async () => {
  const fake = fakeFetch({ overpass: { elements: [] } });
  assert.deepEqual(await fetchNearbyBars(center, fake), []);
  assert.deepEqual(fake.calls, ['overpass query']);
});

test('fetchNearbyBars falls back to Nominatim in order when Overpass fails, and dedupes', async () => {
  for (const overpass of [502, new Error('timed out')]) {
    const fake = fakeFetch({
      overpass,
      nominatim: (q) => ({
        bar: [nominatimHit('Nye\'s', 'bar', 1), nominatimHit('Some Cafe', 'cafe', 9)],
        pub: [nominatimHit('Inbound', 'pub', 2)],
        brewery: [nominatimHit('Inbound', 'brewery', 2, 'craft'), nominatimHit('Modist', 'brewery', 3, 'craft')],
      })[q],
    });
    const places = await fetchNearbyBars(center, fake);
    assert.deepEqual(fake.calls, ['overpass query', 'bar', 'pub', 'brewery']);
    assert.deepEqual(places.map((p) => [p.name, p.kind]).sort(), [['Inbound', 'Pub'], ['Modist', 'Brewery'], ["Nye's", 'Bar']]);
  }
});

test('fetchNearbyBars rejects when Overpass and Nominatim both fail', async () => {
  const fake = fakeFetch({ overpass: 504, nominatim: () => 503 });
  await assert.rejects(fetchNearbyBars(center, fake), (e) => e instanceof AggregateError && e.errors.length === 2);
  assert.deepEqual(fake.calls, ['overpass query', 'bar']);
});

test('parseNominatim keeps only named bars with coordinates', () => {
  const places = parseNominatim([
    nominatimHit('', 'bar', 1),
    { ...nominatimHit('No coords', 'bar', 2), lat: undefined },
    nominatimHit('Proto', 'toString', 3),
    nominatimHit('Beer Garden', 'biergarten', 4),
  ], center);
  assert.deepEqual(places.map((p) => [p.id, p.kind]), [['n4', 'Beer garden']]);
  assert.ok(NOMINATIM_URL.startsWith('https://nominatim.openstreetmap.org/'));
});

test('demo bars sit within a mile of any center', () => {
  for (const c of [center, [21.31, -157.86], [-33.87, 151.21]]) {
    const bars = demoBars(c);
    assert.equal(bars.length, 8);
    for (const b of bars) assert.ok(b.distance < 1609, `${b.name} ${b.distance}`);
  }
});

test('distance and formatting', () => {
  assert.ok(Math.abs(distanceMeters([0, 0], [0, 1]) - 111195) < 10);
  assert.equal(formatDistance(30), '100 ft');
  assert.equal(formatDistance(2000), '1.2 mi');
});
