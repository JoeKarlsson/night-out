import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { createPlan, encodePlan, decodePlan, applyVote, rankPlaces, totalVotes } from './plan.js';
import { fetchNearbyBars, demoBars, formatDistance } from './places.js';

// Honolulu's Chinatown, where Night Out was first built: the demo location
// when someone skips geolocation or says no to it.
const DEMO_CENTER = [21.3115, -157.8625];
const VOTE_KEY = (planId) => `night-out:vote:${planId}`;

const $ = (id) => document.getElementById(id);
const views = { pick: $('pick-view'), vote: $('vote-view'), broken: $('broken-view') };
const TITLES = { pick: 'Where are we going tonight?', vote: 'Vote on tonight', broken: 'This link is broken' };

let pickMap;
let voteMap;
let nearby = { center: null, places: [] };
let currentPlan = null;

function showView(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  $('page-title').textContent = TITLES[name];
}

function makeMap(el) {
  const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

function clearMarkers(map) {
  map.eachLayer((layer) => {
    if (layer instanceof L.CircleMarker) map.removeLayer(layer);
  });
}

function youAreHere(map, center) {
  L.circleMarker(center, { radius: 9, color: '#14111c', weight: 2, fillColor: '#f6e86b', fillOpacity: 1 })
    .bindTooltip('You', { direction: 'top' })
    .addTo(map);
}

function barMarker(map, place, selected) {
  return L.circleMarker([place.lat, place.lng], {
    radius: selected ? 9 : 7,
    color: '#14111c',
    weight: 2,
    fillColor: selected ? '#ff2e88' : '#c9c3d6',
    fillOpacity: 1,
  })
    .bindTooltip(place.name, { direction: 'top' })
    .addTo(map);
}

function fitTo(map, points) {
  map.invalidateSize();
  if (points.length === 1) map.setView(points[0], 15);
  else map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
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
          setPickStatus("Couldn't reach OpenStreetMap right now, so these are made-up demo bars around you.");
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
  pickMap ??= makeMap($('pick-map'));
  clearMarkers(pickMap);
  youAreHere(pickMap, nearby.center);

  const list = $('pick-list');
  list.replaceChildren();
  const markers = new Map();
  nearby.places.forEach((place) => {
    markers.set(place.id, barMarker(pickMap, place, false));
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
      markers.get(place.id).setStyle({ fillColor: box.checked ? '#ff2e88' : '#c9c3d6', radius: box.checked ? 9 : 7 });
      updateStartButton();
    });
  });
  updateStartButton();
  fitTo(pickMap, [nearby.center, ...nearby.places.slice(0, 12).map((p) => [p.lat, p.lng])]);
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
  const myVote = readVote(plan.id);
  const total = totalVotes(plan.votes);
  const ranked = rankPlaces(plan);
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

  voteMap ??= makeMap($('vote-map'));
  clearMarkers(voteMap);
  youAreHere(voteMap, plan.center);
  for (const { place, votes } of ranked) barMarker(voteMap, place, votes > 0 && votes === leader?.votes);
  fitTo(voteMap, plan.places.map((p) => [p.lat, p.lng]));
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
    showView(location.hash.startsWith('#p=') ? 'broken' : 'pick');
    pickMap?.invalidateSize();
    return;
  }
  const plan = decodePlan(match[1]);
  if (plan) renderVote(plan);
  else showView('broken');
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
route();
