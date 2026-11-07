import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, encodePlan, decodePlan, applyVote, rankPlaces, totalVotes, MAX_PLACES } from '../src/plan.js';

const places = [
  { id: 'n1', name: 'Café Ümlaut 🍺', lat: 21.312345678, lng: -157.86, kind: 'Bar' },
  { id: 'w2', name: 'The Pub', lat: 21.31, lng: -157.861 },
  { id: 'n3', name: 'Brew', lat: 21.3, lng: -157.85, kind: 'Brewery' },
];

test('a plan survives encode and decode, unicode included', () => {
  const plan = createPlan([21.31, -157.86], places, 'abc123');
  plan.votes = { n1: 2, n3: 1 };
  const back = decodePlan(encodePlan(plan));
  assert.deepEqual(back, plan);
  assert.equal(back.places[0].lat, 21.31235);
  assert.match(encodePlan(plan), /^[A-Za-z0-9_-]+$/);
});

test('createPlan needs two places and caps the list', () => {
  assert.throws(() => createPlan([0, 0], places.slice(0, 1)));
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, name: `Bar ${i}`, lat: 1, lng: 1 }));
  assert.equal(createPlan([0, 0], many).places.length, MAX_PLACES);
});

test('decodePlan rejects broken or hostile payloads', () => {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const good = { v: 1, i: 'abc', c: [1, 2], p: [['a', 'A', 1, 2, ''], ['b', 'B', 1, 2, '']], t: {} };
  assert.ok(decodePlan(enc(good)));
  assert.equal(decodePlan('not base64 !!!'), null);
  assert.equal(decodePlan(enc({ ...good, v: 2 })), null);
  assert.equal(decodePlan(enc({ ...good, i: '<script>' })), null);
  assert.equal(decodePlan(enc({ ...good, c: [100, 2] })), null);
  assert.equal(decodePlan(enc({ ...good, p: [good.p[0]] })), null);
  assert.equal(decodePlan(enc({ ...good, p: [good.p[0], ['b', 'B', 'x', 2]] })), null);
  // Votes for unknown places, negatives and fractions are dropped
  const odd = decodePlan(enc({ ...good, t: { a: 3, b: -1, zzz: 5 } }));
  assert.deepEqual(odd.votes, { a: 3 });
  assert.deepEqual(decodePlan(enc({ ...good, t: { a: 1.5 } })).votes, {});
});

test('applyVote adds, moves and ignores repeat votes', () => {
  assert.deepEqual(applyVote({}, null, 'a'), { a: 1 });
  assert.deepEqual(applyVote({ a: 1, b: 2 }, 'a', 'b'), { b: 3 });
  assert.deepEqual(applyVote({ a: 2 }, 'a', 'a'), { a: 2 });
  // An old link that never counted this device's vote: never goes negative
  assert.deepEqual(applyVote({ b: 1 }, 'a', 'b'), { b: 2 });
});

test('rankPlaces puts the most votes first and keeps ties in order', () => {
  const plan = createPlan([0, 0], places, 'x');
  plan.votes = { n3: 2, w2: 2 };
  assert.deepEqual(rankPlaces(plan).map((r) => r.place.id), ['w2', 'n3', 'n1']);
  assert.equal(totalVotes(plan.votes), 4);
});
