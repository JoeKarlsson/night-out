// A plan is the whole shared state of one night out. There is no server, so
// it travels in the URL hash: #p=<base64url JSON>. Votes ride along in the
// same link, so each friend votes and passes the new link on.

export const MAX_PLACES = 12;
const MAX_NAME = 80;
const MAX_VOTES = 999;

/**
 * @typedef {{ id: string, name: string, lat: number, lng: number, kind?: string }} Place
 * @typedef {{ id: string, center: [number, number], places: Place[], votes: Record<string, number> }} Plan
 */

export function createPlan(center, places, id = randomId()) {
  if (!Array.isArray(places) || places.length < 2) {
    throw new Error('A plan needs at least two places');
  }
  return {
    id,
    center: [round(center[0]), round(center[1])],
    places: places.slice(0, MAX_PLACES).map((p) => ({
      id: String(p.id),
      name: String(p.name).slice(0, MAX_NAME),
      lat: round(p.lat),
      lng: round(p.lng),
      kind: p.kind ? String(p.kind) : undefined,
    })),
    votes: {},
  };
}

export function encodePlan(plan) {
  const compact = {
    v: 1,
    i: plan.id,
    c: plan.center,
    p: plan.places.map((p) => [p.id, p.name, p.lat, p.lng, p.kind || '']),
    t: plan.votes,
  };
  return toBase64Url(JSON.stringify(compact));
}

/**
 * Parse a plan from the hash payload. Returns null for anything that isn't a
 * well-formed plan, so a mangled link shows "this link is broken" rather than
 * a half-drawn page.
 * @returns {Plan | null}
 */
export function decodePlan(encoded) {
  let raw;
  try {
    raw = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1 || typeof raw.i !== 'string' || !/^[a-z0-9]{1,16}$/.test(raw.i)) return null;
  if (!isLatLng(raw.c) || !Array.isArray(raw.p) || raw.p.length < 2 || raw.p.length > MAX_PLACES) return null;

  const places = [];
  for (const entry of raw.p) {
    if (!Array.isArray(entry)) return null;
    const [id, name, lat, lng, kind] = entry;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !isLatLng([lat, lng])) return null;
    places.push({ id, name: name.slice(0, MAX_NAME), lat, lng, kind: typeof kind === 'string' && kind ? kind : undefined });
  }

  const votes = {};
  if (raw.t && typeof raw.t === 'object') {
    for (const place of places) {
      const count = raw.t[place.id];
      if (Number.isInteger(count) && count > 0) votes[place.id] = Math.min(count, MAX_VOTES);
    }
  }
  return { id: raw.i, center: raw.c, places, votes };
}

/**
 * Move this device's vote. `previous` is what this device voted before (from
 * localStorage), `next` the place just tapped. Returns new vote counts.
 */
export function applyVote(votes, previous, next) {
  if (previous === next) return { ...votes };
  const updated = { ...votes };
  if (previous && updated[previous] > 0) {
    updated[previous] -= 1;
    if (updated[previous] === 0) delete updated[previous];
  }
  updated[next] = Math.min((updated[next] || 0) + 1, MAX_VOTES);
  return updated;
}

/** Places ordered by votes (most first), ties keep the planner's order. */
export function rankPlaces(plan) {
  return plan.places
    .map((place, index) => ({ place, index, votes: plan.votes[place.id] || 0 }))
    .sort((a, b) => b.votes - a.votes || a.index - b.index);
}

export function totalVotes(votes) {
  return Object.values(votes).reduce((sum, n) => sum + n, 0);
}

function isLatLng(pair) {
  return (
    Array.isArray(pair) &&
    pair.length === 2 &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1]) &&
    Math.abs(pair[0]) <= 90 &&
    Math.abs(pair[1]) <= 180
  );
}

function round(n) {
  return Math.round(n * 1e5) / 1e5;
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
