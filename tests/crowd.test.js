import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowdSchedule, crowdAt, addVotes, describeEvent, mulberry32, seedFrom, FRIEND_NAMES } from '../src/crowd.js';

const places = [
  { id: 'n1', name: 'Neon Hops' },
  { id: 'n2', name: 'Corner Booth' },
  { id: 'n3', name: 'The Last Call' },
];
const planFor = (id) => ({ id, places });
const ids = Array.from({ length: 200 }, (_, i) => `plan${i}`);

test('the same plan always gets the same crowd, and different plans differ', () => {
  assert.deepEqual(crowdSchedule(planFor('abc123')), crowdSchedule(planFor('abc123')));
  const distinct = new Set(ids.map((id) => JSON.stringify(crowdSchedule(planFor(id)))));
  assert.ok(distinct.size > 190);
});

test('8 to 14 friends with real names, each voting once: first in 1-2s, last by 25s, sorted by time', () => {
  const sizes = new Set();
  for (const id of ids) {
    const schedule = crowdSchedule(planFor(id));
    const firstVotes = schedule.filter((e) => !e.previous);
    const friends = new Set(firstVotes.map((e) => e.friend));
    assert.equal(friends.size, firstVotes.length, 'nobody votes twice');
    assert.ok(friends.size >= 8 && friends.size <= 14, `${friends.size} friends`);
    sizes.add(friends.size);
    for (const e of schedule) {
      assert.ok(FRIEND_NAMES.includes(e.friend));
      assert.ok(places.some((p) => p.id === e.placeId));
    }
    for (const e of firstVotes) assert.ok(e.at >= 1_000 && e.at <= 25_000, `${e.at}`);
    assert.ok(schedule[0].at <= 2_000, `first vote at ${schedule[0].at}`);
    assert.ok(Math.max(...firstVotes.map((e) => e.at)) >= 1_000);
    for (const change of schedule.filter((e) => e.previous)) {
      const first = firstVotes.find((e) => e.friend === change.friend);
      assert.equal(change.previous, first.placeId);
      assert.notEqual(change.placeId, first.placeId, 'a change picks a different bar');
      assert.ok(change.at >= first.at + 3_000 && change.at <= first.at + 8_000);
    }
    assert.deepEqual(schedule.map((e) => e.at), [...schedule.map((e) => e.at)].sort((a, b) => a - b));
  }
  assert.deepEqual([...sizes].sort((a, b) => a - b), [8, 9, 10, 11, 12, 13, 14]);
});

test('some crowds change their minds, most do not', () => {
  const withChanges = ids.filter((id) => crowdSchedule(planFor(id)).some((e) => e.previous)).length;
  assert.ok(withChanges > 40 && withChanges < 190, `${withChanges}`);
});

test('crowdAt counts each friend once, for their latest pick', () => {
  const schedule = [
    { at: 10, friend: 'Sam', placeId: 'n1', previous: null },
    { at: 20, friend: 'Jo', placeId: 'n2', previous: null },
    { at: 30, friend: 'Sam', placeId: 'n2', previous: 'n1' },
  ];
  assert.deepEqual(crowdAt(schedule, 5), { votes: {}, happened: [] });
  assert.deepEqual(crowdAt(schedule, 25).votes, { n1: 1, n2: 1 });
  assert.deepEqual(crowdAt(schedule, 30).votes, { n2: 2 });
  assert.equal(crowdAt(schedule, 99).happened.length, 3);
});

test('addVotes and describeEvent', () => {
  assert.deepEqual(addVotes({ n1: 1 }, { n1: 2, n2: 1 }), { n1: 3, n2: 1 });
  assert.equal(describeEvent({ friend: 'Sam', placeId: 'n1', previous: null }, places), 'Sam voted for Neon Hops');
  assert.equal(describeEvent({ friend: 'Sam', placeId: 'n2', previous: 'n1' }, places), 'Sam changed their vote to Corner Booth');
});

test('the generator is seeded and stays in [0, 1)', () => {
  const a = mulberry32(seedFrom('x'));
  const b = mulberry32(seedFrom('x'));
  for (let i = 0; i < 1000; i++) {
    const n = a();
    assert.equal(n, b());
    assert.ok(n >= 0 && n < 1);
  }
});
