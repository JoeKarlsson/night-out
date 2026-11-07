import './style.css';
import { createPlan, encodePlan, decodePlan, applyVote, rankPlaces, totalVotes, mergeVotes } from './plan.js';
import { fetchNearbyBars, demoBars, formatDistance } from './places.js';
import { DEFAULT_CENTER, defaultBars } from './default-bars.js';
import { createMap } from './map.js';
import { crowdSchedule, crowdAt, addVotes, describeEvent } from './crowd.js';

const VOTE_KEY = (planId) => `night-out:vote:${planId}`;

const $ = (id) => document.getElementById(id);
const views = { pick: $('pick-view'), vote: $('vote-view'), broken: $('broken-view') };
const TITLES = { pick: 'Where are we going tonight?', vote: 'Vote on tonight', broken: 'This link is broken' };

let nearby = { center: null, places: [] };
let currentPlan = null;
let voteOrder = { planId: null, ids: [] };

// ---- Simulated friends -----------------------------------------------------
// Made-up friends vote over the first minute so the page feels live. Their
// votes are added on screen only; the share link carries real votes alone.
// ?fast runs the minute in under a second, for the end-to-end tests.
const CROWD_SPEED = new URLSearchParams(location.search).has('fast') ? 100 : 1;
const CROWD_START_KEY = (planId) => `night-out:crowd-start:${planId}`;
let crowd = null;

function crowdStartTime(planId, headStartMs) {
  try {
    const saved = Number(localStorage.getItem(CROWD_START_KEY(planId)));
    if (saved > 0 && saved <= Date.now()) return saved;
    const now = Date.now() - headStartMs;
    localStorage.setItem(CROWD_START_KEY(planId), String(now));
    return now;
  } catch {
    return Date.now() - headStartMs;
  }
}

function crowdElapsed() {
  return (Date.now() - crowd.start) * CROWD_SPEED;
}

function startCrowd(plan) {
  if (crowd?.planId === plan.id) return;
  stopCrowd();
  // The autoplay demo starts its crowd a few seconds in, so votes come soon
  const headStart = plan.id === demoPlanId ? DEMO_HEAD_START_MS / CROWD_SPEED : 0;
  crowd = { planId: plan.id, schedule: crowdSchedule(plan), start: crowdStartTime(plan.id, headStart), shown: 0, timer: null };
  $('crowd-feed').replaceChildren();
  scheduleNextCrowdVote();
}

function scheduleNextCrowdVote() {
  const next = crowd.schedule.find((event) => event.at > crowdElapsed());
  if (!next) return;
  crowd.timer = setTimeout(() => {
    if (currentPlan?.id === crowd.planId) renderVote(currentPlan);
    scheduleNextCrowdVote();
  }, (next.at - crowdElapsed()) / CROWD_SPEED + 20);
}

function stopCrowd() {
  if (crowd) clearTimeout(crowd.timer);
  crowd = null;
}

/** Append only the new lines, so screen readers announce each vote once. */
function renderCrowdFeed(happened, places) {
  const feed = $('crowd-feed');
  for (const event of happened.slice(crowd.shown)) {
    const li = document.createElement('li');
    li.textContent = describeEvent(event, places);
    // Highlight votes as they arrive, not a backlog shown after a refresh
    if (crowdElapsed() - event.at < 2000) li.className = 'is-new';
    feed.append(li);
  }
  crowd.shown = happened.length;
  $('crowd-waiting').hidden = happened.length > 0;
}

function showView(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  $('page-title').textContent = TITLES[name];
}

// One map per view, made the first time it's needed. If MapLibre can't
// start (no WebGL), the map box says so and the list still works.
async function mapFor(el) {
  if (!el.mapPromise) {
    el.mapPromise = createMap(el).catch((error) => {
      el.classList.add('map-failed');
      el.textContent = "The map couldn't load in this browser. The list below has every bar.";
      window.plausible?.('JS Error', { props: { message: `map: ${error.message}` } });
      return null;
    });
  }
  return el.mapPromise;
}

// ---- Pick view -------------------------------------------------------------

// An unanswered location prompt never times out by itself, so cap the wait
const LOCATION_WAIT_MS = 5000;
// Overpass and Nominatim together get this long before the made-up bars show
const SEARCH_BUDGET_MS = 8000;
let lateCenter = null;

function setPickStatus(message) {
  $('pick-status').textContent = message;
}

function showDefaultBars(message) {
  nearby = { center: DEFAULT_CENTER, places: defaultBars() };
  setPickStatus(message);
  renderPicker();
}

/** `request` settles whenever the browser answers; `inTime` rejects after `ms`. */
function getPosition(ms) {
  const request = new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition((pos) => resolve([pos.coords.latitude, pos.coords.longitude]), reject, {
      enableHighAccuracy: false,
      maximumAge: 300000,
    });
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('no answer')), ms));
  return { request, inTime: Promise.race([request, timeout]) };
}

async function findBarsNearMe() {
  $('locate').disabled = true;
  $('use-location').hidden = true;
  setPickStatus('Finding you…');
  const { request, inTime } = getPosition(LOCATION_WAIT_MS);
  let center;
  try {
    center = await inTime;
  } catch {
    showDefaultBars("Couldn't get your location, so here are real bars in Honolulu's Chinatown instead.");
    // If the location turns up later, offer it rather than moving the map
    request.then(
      (late) => {
        lateCenter = late;
        $('use-location').hidden = false;
      },
      () => {},
    );
    $('locate').disabled = false;
    return;
  }
  await searchAt(center);
  $('locate').disabled = false;
}

async function searchAt(center) {
  setPickStatus('Looking for bars nearby…');
  // Say something while a slow search runs, so it never looks stuck
  const slow = setTimeout(() => setPickStatus('Still looking. OpenStreetMap is slow right now…'), 3000);
  let places;
  try {
    places = await fetchNearbyBars(center, { signal: AbortSignal.timeout(SEARCH_BUDGET_MS) });
    setPickStatus(
      places.length
        ? `Found ${places.length} bars within a mile and a half.`
        : 'No bars found within a mile and a half. Here are made-up demo bars to try it with.',
    );
    if (!places.length) places = demoBars(center);
  } catch {
    places = demoBars(center);
    setPickStatus(
      "OpenStreetMap's bar search isn't answering right now, so these are made-up demo bars, not real ones. Tap Find bars near me to try again.",
    );
  } finally {
    clearTimeout(slow);
  }
  nearby = { center, places };
  renderPicker();
}

function renderPicker() {
  $('pick-layout').hidden = false;

  const list = $('pick-list');
  list.replaceChildren();
  const shown = nearby;
  const mapReady = mapFor($('pick-map')).then((map) => {
    if (map && nearby === shown) map.showPlaces(shown.center, shown.places);
    return map;
  });
  nearby.places.forEach((place) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'place';
    box.value = place.id;
    const name = document.createElement('span');
    name.className = 'place-name';
    name.textContent = place.name;
    const meta = document.createElement('span');
    meta.className = 'place-meta';
    meta.textContent = `${place.kind}, ${formatDistance(place.distance)}`;
    label.append(box, name, meta);
    li.append(label);
    list.append(li);
    box.addEventListener('change', () => {
      mapReady.then((map) => map?.setSelected(place.id, box.checked));
      updateStartButton();
    });
  });
  updateStartButton();
}

function selectedPlaces() {
  const ids = new Set([...$('pick-form').querySelectorAll('input[name=place]:checked')].map((b) => b.value));
  return nearby.places.filter((p) => ids.has(p.id));
}

function updateStartButton() {
  const count = selectedPlaces().length;
  const start = $('start');
  start.disabled = count < 2;
  start.textContent = count < 2 ? 'Pick at least two bars' : `Start the vote with ${count} bars`;
}

$('locate').addEventListener('click', findBarsNearMe);
$('use-location').addEventListener('click', () => {
  $('use-location').hidden = true;
  searchAt(lateCenter);
});
$('pick-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const plan = createPlan(nearby.center, selectedPlaces());
  location.hash = `p=${encodePlan(plan)}`;
});

// ---- Autoplay demo ---------------------------------------------------------
// With no plan in the URL, the page plays the demo by itself: real Honolulu
// bars, three get picked, the vote opens and made-up friends vote. Any click,
// tap or key stops it where it is.

const AUTOPLAY_STEP_MS = 1500 / CROWD_SPEED;
const DEMO_HEAD_START_MS = 8000;
let autoplay = null;
// Remembered for the tab, so a refresh still labels the demo plan as a demo
const DEMO_PLAN_KEY = 'night-out:demo-plan';
let demoPlanId = readDemoPlanId();

function readDemoPlanId() {
  try {
    return sessionStorage.getItem(DEMO_PLAN_KEY);
  } catch {
    return null;
  }
}

function updateDemoBanner() {
  const onDemo = autoplay || (currentPlan && currentPlan.id === demoPlanId);
  $('demo-banner').hidden = !onDemo;
  $('demo-banner-text').textContent = autoplay
    ? 'This demo runs by itself: Night Out picks three real bars in Honolulu, then made-up friends vote. Tap anywhere to take over.'
    : 'This is a demo plan. The bars are real; the friends voting are made up.';
}

function checkPlace(id) {
  const box = $('pick-form').querySelector(`input[value="${CSS.escape(id)}"]`);
  if (!box || box.checked) return;
  box.checked = true;
  box.dispatchEvent(new Event('change'));
}

function openDemoPlan() {
  const plan = createPlan(nearby.center, selectedPlaces());
  demoPlanId = plan.id;
  try {
    sessionStorage.setItem(DEMO_PLAN_KEY, plan.id);
  } catch {
    // The banner still shows until a refresh
  }
  // replaceState: the demo shouldn't leave a trail in the back button
  history.replaceState(null, '', `${location.pathname}${location.search}#p=${encodePlan(plan)}`);
  route();
}

function startAutoplay() {
  showView('pick');
  showDefaultBars("Bars in Honolulu's Chinatown, where Night Out began.");
  const listeners = new AbortController();
  autoplay = { timers: [], listeners };
  updateDemoBanner();
  const steps = [...nearby.places.slice(0, 3).map((place) => () => checkPlace(place.id)), () => {
    stopAutoplay();
    openDemoPlan();
  }];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    steps.forEach((step) => step());
    return;
  }
  steps.forEach((step, i) => autoplay.timers.push(setTimeout(step, AUTOPLAY_STEP_MS * (i + 1))));
  // The banner's own button handles itself; anything else stops the demo
  const takeOver = (event) => {
    if (!$('demo-banner').contains(event.target)) stopAutoplay();
  };
  for (const type of ['pointerdown', 'keydown', 'wheel']) {
    addEventListener(type, takeOver, { capture: true, signal: listeners.signal });
  }
}

function stopAutoplay() {
  if (!autoplay) return;
  autoplay.timers.forEach(clearTimeout);
  autoplay.listeners.abort();
  autoplay = null;
  updateDemoBanner();
}

$('own-plan').addEventListener('click', () => {
  stopAutoplay();
  history.pushState(null, '', `${location.pathname}${location.search}`);
  route();
  $('pick-form').querySelectorAll('input[name=place]:checked').forEach((box) => {
    box.checked = false;
    box.dispatchEvent(new Event('change'));
  });
  setPickStatus("Bars in Honolulu's Chinatown are below. Tap Find bars near me to plan a night where you are.");
});

// ---- Vote view -------------------------------------------------------------

function readVote(planId) {
  try {
    return localStorage.getItem(VOTE_KEY(planId));
  } catch {
    return null;
  }
}

// Votes from every link for a plan that this device has opened, merged, so
// friends' links that forked don't each lose the others' votes
const TALLY_KEY = (planId) => `night-out:tally:${planId}`;

function readTally(planId) {
  try {
    return JSON.parse(localStorage.getItem(TALLY_KEY(planId))) ?? {};
  } catch {
    return {};
  }
}

function saveTally(planId, votes) {
  try {
    localStorage.setItem(TALLY_KEY(planId), JSON.stringify(votes));
  } catch {
    // Private mode: the link's own votes still show
  }
}

function saveVote(planId, placeId) {
  try {
    localStorage.setItem(VOTE_KEY(planId), placeId);
  } catch {
    $('vote-status').textContent = "This browser won't save your vote, so tapping again will count twice.";
  }
}

function shareUrl(plan) {
  return `${location.origin}${location.pathname}#p=${encodePlan(plan)}`;
}

function renderVote(plan) {
  currentPlan = plan;
  showView('vote');
  startCrowd(plan);
  const fakes = crowdAt(crowd.schedule, crowdElapsed());
  renderCrowdFeed(fakes.happened, plan.places);
  // What's on screen: real votes from the link plus the simulated friends
  const shown = { ...plan, votes: addVotes(plan.votes, fakes.votes) };
  const focusedPlace = document.activeElement?.dataset?.place;
  updateDemoBanner();
  const myVote = readVote(plan.id);
  const total = totalVotes(shown.votes);
  const ranked = rankPlaces(shown);
  const leader = total > 0 ? ranked[0] : null;
  const tie = leader && ranked[1] && ranked[1].votes === leader.votes;

  $('vote-summary').textContent =
    total === 0
      ? `${plan.places.length} bars, no votes yet.`
      : tie
        ? `${total} ${total === 1 ? 'vote' : 'votes'} so far, and it's a tie at the top.`
        : `${total} ${total === 1 ? 'vote' : 'votes'} so far. ${leader.place.name} is winning.`;
  $('share-link').value = shareUrl(plan);

  // Rank once when the vote opens; after that rows stay put, so a vote
  // (yours or a friend's) never moves a button under your thumb
  if (voteOrder.planId !== plan.id) voteOrder = { planId: plan.id, ids: ranked.map(({ place }) => place.id) };
  const byId = new Map(ranked.map((row) => [row.place.id, row]));

  const list = $('vote-list');
  list.replaceChildren();
  for (const { place, votes } of voteOrder.ids.map((id) => byId.get(id))) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vote-button';
    button.dataset.place = place.id;
    button.setAttribute('aria-pressed', String(myVote === place.id));
    const name = document.createElement('span');
    name.className = 'place-name';
    name.textContent = place.name;
    const count = document.createElement('span');
    count.className = 'vote-count';
    count.textContent = `${votes} ${votes === 1 ? 'vote' : 'votes'}${myVote === place.id ? ', yours' : ''}`;
    const bar = document.createElement('span');
    bar.className = 'vote-bar';
    bar.style.setProperty('--share', total ? votes / total : 0);
    button.append(name, count, bar);
    button.addEventListener('click', () => castVote(place.id));
    li.append(button);
    list.append(li);
  }

  // Re-rendering for a friend's vote mustn't steal keyboard focus
  if (focusedPlace) list.querySelector(`[data-place="${CSS.escape(focusedPlace)}"]`)?.focus();

  const leaders = new Set(ranked.filter(({ votes }) => votes > 0 && votes === leader?.votes).map(({ place }) => place.id));
  mapFor($('vote-map')).then((map) => {
    if (!map || currentPlan !== plan) return;
    // Fit the view once per plan, so a friend's vote doesn't undo panning
    map.showPlaces(plan.center, plan.places, leaders, { fit: $('vote-map').fittedPlan !== plan.id });
    $('vote-map').fittedPlan = plan.id;
  });
}

function castVote(placeId) {
  const previous = readVote(currentPlan.id);
  if (previous === placeId) {
    $('vote-status').textContent = 'You already voted for that one.';
    return;
  }
  const plan = { ...currentPlan, votes: applyVote(currentPlan.votes, previous, placeId) };
  saveVote(plan.id, placeId);
  saveTally(plan.id, plan.votes);
  // replaceState: changing a vote shouldn't fill the back button with links
  history.replaceState(null, '', `#p=${encodePlan(plan)}`);
  renderVote(plan);
  const name = plan.places.find((p) => p.id === placeId).name;
  $('vote-status').textContent = `Voted for ${name}. Copy the new link and send it to the group.`;
  window.plausible?.('Vote');
}

$('copy').addEventListener('click', async () => {
  const input = $('share-link');
  try {
    await navigator.clipboard.writeText(input.value);
    $('vote-status').textContent = 'Link copied.';
  } catch {
    input.select();
    $('vote-status').textContent = 'Select the link and copy it.';
  }
  window.plausible?.('Copy Link');
});

if (navigator.share) {
  $('native-share').hidden = false;
  $('native-share').addEventListener('click', () => {
    navigator.share({ title: 'Night Out', text: 'Vote on where we go tonight', url: $('share-link').value }).catch(() => {});
    window.plausible?.('Share');
  });
}

// ---- Routing ---------------------------------------------------------------

// The skip link would otherwise set #main and drop the plan out of the URL
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  $('main').focus();
});

for (const link of document.querySelectorAll('[data-home]')) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    history.pushState(null, '', location.pathname);
    route();
  });
}

let firstRoute = true;

function route() {
  const isFirstRoute = firstRoute;
  firstRoute = false;
  if (!isFirstRoute) stopAutoplay();
  const match = location.hash.match(/^#p=([A-Za-z0-9_-]+)$/);
  $('vote-status').textContent = '';
  if (!match) {
    currentPlan = null;
    stopCrowd();
    if (location.hash.startsWith('#p=')) {
      showView('broken');
    } else if (isFirstRoute) {
      // A bare visit plays the demo; a shared link never does
      startAutoplay();
    } else {
      showView('pick');
      if (!nearby.places.length) showDefaultBars("Bars in Honolulu's Chinatown, where Night Out began.");
      $('pick-map').mapPromise?.then((map) => map?.resize());
    }
    updateDemoBanner();
    return;
  }
  const plan = decodePlan(match[1]);
  if (!plan) {
    stopCrowd();
    showView('broken');
    updateDemoBanner();
    return;
  }
  const merged = mergeVotes(readTally(plan.id), plan.votes);
  saveTally(plan.id, merged);
  const withTally = { ...plan, votes: merged };
  if (totalVotes(merged) !== totalVotes(plan.votes)) {
    history.replaceState(null, '', `${location.pathname}${location.search}#p=${encodePlan(withTally)}`);
  }
  renderVote(withTally);
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
route();
