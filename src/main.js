import './style.css';
import { createPlan, encodePlan, decodePlan, applyVote, rankPlaces, totalVotes } from './plan.js';
import { fetchNearbyBars, demoBars, formatDistance } from './places.js';
import { createMap } from './map.js';
import { crowdSchedule, crowdAt, addVotes, describeEvent } from './crowd.js';

// Honolulu's Chinatown, where Night Out was first built: the demo location
// when someone skips geolocation or says no to it.
const DEMO_CENTER = [21.3115, -157.8625];
const VOTE_KEY = (planId) => `night-out:vote:${planId}`;

const $ = (id) => document.getElementById(id);
const views = { pick: $('pick-view'), vote: $('vote-view'), broken: $('broken-view') };
const TITLES = { pick: 'Where are we going tonight?', vote: 'Vote on tonight', broken: 'This link is broken' };

let nearby = { center: null, places: [] };
let currentPlan = null;

// ---- Simulated friends -----------------------------------------------------
// Made-up friends vote over the first minute so the page feels live. Their
// votes are added on screen only; the share link carries real votes alone.
// ?fast runs the minute in under a second, for the end-to-end tests.
const CROWD_SPEED = new URLSearchParams(location.search).has('fast') ? 100 : 1;
const CROWD_START_KEY = (planId) => `night-out:crowd-start:${planId}`;
let crowd = null;

function crowdStartTime(planId) {
  try {
    const saved = Number(localStorage.getItem(CROWD_START_KEY(planId)));
    if (saved > 0 && saved <= Date.now()) return saved;
    const now = Date.now();
    localStorage.setItem(CROWD_START_KEY(planId), String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function crowdElapsed() {
  return (Date.now() - crowd.start) * CROWD_SPEED;
}

function startCrowd(plan) {
  if (crowd?.planId === plan.id) return;
  stopCrowd();
  crowd = { planId: plan.id, schedule: crowdSchedule(plan), start: crowdStartTime(plan.id), shown: 0, timer: null };
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

function setPickStatus(message) {
  $('pick-status').textContent = message;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      reject,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}

async function findBars(useDemo) {
  const buttons = $('locate-actions').querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  let center = DEMO_CENTER;
  let places;
  try {
    if (useDemo) {
      places = demoBars(center);
      setPickStatus('Showing made-up demo bars in Honolulu, where Night Out began.');
    } else {
      setPickStatus('Finding you…');
      try {
        center = await getPosition();
      } catch {
        places = demoBars(center);
        setPickStatus("Couldn't get your location, so here are made-up demo bars in Honolulu instead.");
      }
      if (!places) {
        setPickStatus('Looking for bars nearby…');
        try {
          places = await fetchNearbyBars(center);
          setPickStatus(
            places.length
              ? `Found ${places.length} bars within a mile and a half.`
              : 'No bars found within a mile and a half. Here are made-up demo bars to try it with.',
          );
          if (!places.length) places = demoBars(center);
        } catch {
          places = demoBars(center);
          setPickStatus("OpenStreetMap's bar search isn't answering right now, so these are made-up demo bars, not real ones. Try again in a few minutes.");
        }
      }
    }
  } finally {
    buttons.forEach((b) => (b.disabled = false));
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

$('locate').addEventListener('click', () => findBars(false));
$('demo').addEventListener('click', () => findBars(true));
$('pick-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const plan = createPlan(nearby.center, selectedPlaces());
  location.hash = `p=${encodePlan(plan)}`;
});

// ---- Vote view -------------------------------------------------------------

function readVote(planId) {
  try {
    return localStorage.getItem(VOTE_KEY(planId));
  } catch {
    return null;
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

  const list = $('vote-list');
  list.replaceChildren();
  for (const { place, votes } of ranked) {
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

function route() {
  const match = location.hash.match(/^#p=([A-Za-z0-9_-]+)$/);
  $('vote-status').textContent = '';
  if (!match) {
    currentPlan = null;
    stopCrowd();
    showView(location.hash.startsWith('#p=') ? 'broken' : 'pick');
    $('pick-map').mapPromise?.then((map) => map?.resize());
    return;
  }
  const plan = decodePlan(match[1]);
  if (plan) renderVote(plan);
  else {
    stopCrowd();
    showView('broken');
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
route();
