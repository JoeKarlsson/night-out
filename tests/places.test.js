import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOverpass, demoBars, distanceMeters, formatDistance, overpassQuery, fetchNearbyBars } from '../src/places.js';

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

test('fetchNearbyBars posts the query and throws on HTTP errors', async () => {
  let body;
  const ok = async (_url, init) => { body = init.body.get('data'); return { ok: true, json: async () => ({ elements: [] }) }; };
  assert.deepEqual(await fetchNearbyBars(center, { fetchImpl: ok }), []);
  assert.equal(body, overpassQuery(...center));
  await assert.rejects(fetchNearbyBars(center, { fetchImpl: async () => ({ ok: false, status: 429 }) }), /429/);
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
