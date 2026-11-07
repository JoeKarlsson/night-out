// Simulated friends for the demo: a crowd of made-up people vote on a plan
// over its first 15-25 seconds, so the vote page feels alive without a server. Their
// votes are shown on screen only and never written into the share link.
// The crowd is seeded by the plan id, so a refresh brings back the same people.

export const FRIEND_NAMES = [
  'Sam', 'Riley', 'Jo', 'Maya', 'Theo', 'Priya', 'Luis', 'Nina', 'Ari', 'Dev',
  'Kat', 'Omar', 'Bea', 'Finn', 'Lena', 'Marco', 'Tess', 'Yusuf',
];
const MIN_FRIENDS = 8;
const MAX_FRIENDS = 14;
// The first vote lands 1-2s in, the last somewhere between 15 and 25s
const FIRST_VOTE_MS = [1_000, 2_000];
const LAST_VOTE_MS = [15_000, 25_000];
const CHANGE_CHANCE = 0.12;

/** 32-bit FNV-1a hash of a string. */
export function seedFrom(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small seeded random number generator: returns numbers in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every simulated vote for `plan`, sorted by time: [{ at, friend, placeId, previous }].
 * `previous` is set when a friend changes their mind.
 */
export function crowdSchedule(plan) {
  const rng = mulberry32(seedFrom(plan.id));
  const names = [...FRIEND_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const friends = names.slice(0, MIN_FRIENDS + Math.floor(rng() * (MAX_FRIENDS - MIN_FRIENDS + 1)));
  // Each bar gets a random pull, so some bars are clearly more popular
  const weights = plan.places.map(() => 0.3 + rng());

  function pick(exclude) {
    const options = plan.places.map((place, i) => ({ id: place.id, weight: place.id === exclude ? 0 : weights[i] }));
    let roll = rng() * options.reduce((sum, o) => sum + o.weight, 0);
    for (const option of options) {
      roll -= option.weight;
      if (roll < 0 && option.weight > 0) return option.id;
    }
    return options.findLast((o) => o.weight > 0).id;
  }

  const between = ([low, high]) => low + rng() * (high - low);
  const first = between(FIRST_VOTE_MS);
  const last = between(LAST_VOTE_MS);
  const events = [];
  friends.forEach((friend, i) => {
    const at = Math.round(i === 0 ? first : between([first, last]));
    const placeId = pick();
    events.push({ at, friend, placeId, previous: null });
    if (rng() < CHANGE_CHANCE) {
      const later = Math.round(at + between([3_000, 8_000]));
      events.push({ at: later, friend, placeId: pick(placeId), previous: placeId });
    }
  });
  return events.sort((a, b) => a.at - b.at);
}

/** Votes and feed after `elapsedMs`: each friend counts once, for their latest pick. */
export function crowdAt(schedule, elapsedMs) {
  const happened = schedule.filter((event) => event.at <= elapsedMs);
  const latest = new Map();
  for (const event of happened) latest.set(event.friend, event.placeId);
  const votes = {};
  for (const placeId of latest.values()) votes[placeId] = (votes[placeId] || 0) + 1;
  return { votes, happened };
}

export function addVotes(a, b) {
  const sum = { ...a };
  for (const [id, n] of Object.entries(b)) sum[id] = (sum[id] || 0) + n;
  return sum;
}

export function describeEvent(event, places) {
  const name = (id) => places.find((p) => p.id === id)?.name ?? 'a bar';
  return event.previous
    ? `${event.friend} changed their vote to ${name(event.placeId)}`
    : `${event.friend} voted for ${name(event.placeId)}`;
}
