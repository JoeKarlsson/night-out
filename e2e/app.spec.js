import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { decodePlan } from '../src/plan.js';
import { FRIEND_NAMES } from '../src/crowd.js';
import { DEMO_VIEW } from '../src/default-bars.js';

const HERE = { latitude: 44.9778, longitude: -93.265 };
const overpass = {
  elements: [
    { type: 'node', id: 1, lat: 44.979, lon: -93.266, tags: { amenity: 'bar', name: 'Test Tavern' } },
    { type: 'node', id: 2, lat: 44.976, lon: -93.262, tags: { amenity: 'pub', name: 'Fake & Firkin <b>' } },
    { type: 'way', id: 3, center: { lat: 44.981, lon: -93.27 }, tags: { craft: 'brewery', name: 'Mock Brewing' } },
  ],
};
const nominatim = {
  bar: [{ name: 'Nominatim Tavern', category: 'amenity', type: 'bar', osm_type: 'node', osm_id: 7, lat: '44.979', lon: '-93.266' }],
  pub: [],
  brewery: [{ name: 'Nominatim Brewing', category: 'craft', type: 'brewery', osm_type: 'way', osm_id: 8, lat: '44.981', lon: '-93.27' }],
};
// A map style with only a background, so the map draws without tiles
const STYLE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0c0c0c' } }] };

// No real network in tests: the map style, Overpass and Nominatim are
// stubbed, and any other third-party request fails the test.
async function stubNetwork(page, { overpassStatus = 200, nominatimStatus = 200 } = {}) {
  const failed = [];
  await page.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ json: STYLE }));
  await page.route('https://overpass-api.de/**', (r) =>
    overpassStatus === 200 ? r.fulfill({ json: overpass }) : r.fulfill({ status: overpassStatus, body: 'busy' }),
  );
  await page.route('https://nominatim.openstreetmap.org/**', (r) =>
    nominatimStatus === 200
      ? r.fulfill({ json: nominatim[new URL(r.request().url()).searchParams.get('q')] ?? [] })
      : r.fulfill({ status: nominatimStatus, body: 'busy' }),
  );
  page.on('requestfailed', (req) => failed.push(req.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { failed, errors };
}

async function expectNoSideScroll(page) {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll).toBeLessThanOrEqual(inner);
}

async function axe(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

test('home page has its metadata and passes axe', async ({ page }) => {
  const { errors } = await stubNetwork(page);
  await page.goto('./');
  await expect(page).toHaveTitle(/Night Out/);
  await expect(page.locator('h1')).toHaveCount(1);
  for (const sel of [
    'meta[name=description]', 'link[rel=canonical]', 'meta[property="og:image"]', 'meta[name="twitter:card"]',
    'meta[name=color-scheme][content="only dark"]', 'meta[name=darkreader-lock]', 'meta[http-equiv=Content-Security-Policy]',
  ]) await expect(page.locator(sel)).toHaveCount(1);
  const desc = await page.locator('meta[name=description]').getAttribute('content');
  expect(desc.length).toBeLessThan(160);
  const og = await page.request.get('og.png');
  expect(og.ok()).toBe(true);
  await axe(page);
  await expectNoSideScroll(page);
  expect(errors).toEqual([]);
});

const FRIEND = new RegExp(`^(${FRIEND_NAMES.join('|')}) (voted for|changed their vote to) `);
// Real votes in a share link (simulated friends never go in it)
const linkVotes = (link) => decodePlan(new URL(link).hash.slice('#p='.length)).votes;
const voteButton = (page, name) => page.locator('#vote-list').getByRole('button', { name });

// The demo autoplays on a bare visit; "Start your own plan" takes over
async function takeOver(page) {
  await page.getByRole('button', { name: 'Start your own plan' }).click();
  await expect(page.locator('h1')).toHaveText('Where are we going tonight?');
}

// A plan link made by the fast autoplay, with ?fast dropped
async function demoPlanLink(page) {
  await page.goto('./?fast');
  await expect(page.locator('h1')).toHaveText('Vote on tonight');
  return page.locator('#share-link').inputValue();
}

test('find bars, start a vote, vote, change the vote and share the link', async ({ page, context, browserName }) => {
  const { errors, failed } = await stubNetwork(page);
  await context.setGeolocation(HERE);
  if (browserName === 'chromium') await context.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write']);
  else await context.grantPermissions(['geolocation']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Find bars near me' }).click();
  await expect(page.getByRole('status').first()).toContainText('Found 3 bars');

  const start = page.locator('#start');
  await expect(start).toBeDisabled();
  // Names from OSM are text, never HTML
  await expect(page.getByText('Fake & Firkin <b>')).toBeVisible();
  await page.getByLabel(/Test Tavern/).check();
  await page.getByLabel(/Mock Brewing/).check();
  await expect(start).toHaveText('Start the vote with 2 bars');
  await start.click();

  await expect(page.locator('h1')).toHaveText('Vote on tonight');
  await expect(page.locator('#demo-banner')).toBeHidden();
  await axe(page);
  await expectNoSideScroll(page);

  const order = await page.locator('#vote-list .place-name').allTextContents();
  await voteButton(page, /Mock Brewing/).click();
  await expect(voteButton(page, /Mock Brewing/)).toContainText('yours');
  await voteButton(page, /Test Tavern/).click();
  await expect(voteButton(page, /Test Tavern/)).toContainText('yours');
  // Voting doesn't reorder the rows
  expect(await page.locator('#vote-list .place-name').allTextContents()).toEqual(order);

  // A friend opens the shared link on another phone and votes too
  const link = await page.locator('#share-link').inputValue();
  const tavern = Object.keys(linkVotes(link))[0];
  expect(linkVotes(link)).toEqual({ [tavern]: 1 });
  if (browserName === 'chromium') {
    await page.getByRole('button', { name: 'Copy link' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  }
  const friend = await context.browser().newPage();
  await stubNetwork(friend);
  await friend.goto(link);
  await voteButton(friend, /Test Tavern/).click();
  await expect(voteButton(friend, /Test Tavern/)).toContainText('yours');
  expect(linkVotes(await friend.locator('#share-link').inputValue())).toEqual({ [tavern]: 2 });
  await friend.close();

  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('a location that never comes falls back to Honolulu bars, then offers it when it arrives', async ({ page }) => {
  await stubNetwork(page);
  // A location prompt nobody answers: getCurrentPosition never calls back
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition(ok) {
          window.answerLocation = (latitude, longitude) => ok({ coords: { latitude, longitude } });
        },
      },
    });
  });
  await page.goto('./');
  await takeOver(page);
  await page.getByRole('button', { name: 'Find bars near me' }).click();
  await expect(page.locator('#pick-status')).toHaveText('Finding you…');
  await expect(page.locator('#pick-status')).toContainText("real bars in Honolulu's Chinatown", { timeout: 6000 });
  await expect(page.getByLabel(/Bar 35/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeHidden();

  await page.evaluate(() => window.answerLocation(44.9778, -93.265));
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('#pick-status')).toContainText('Found 3 bars');
});

test('Overpass down falls back to Nominatim, and the map draws', async ({ page, context }) => {
  const { errors } = await stubNetwork(page, { overpassStatus: 502 });
  await context.setGeolocation(HERE);
  await context.grantPermissions(['geolocation']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Find bars near me' }).click();
  await expect(page.locator('#pick-status')).toContainText('Found 2 bars');
  await expect(page.getByText('Nominatim Brewing')).toBeVisible();
  // MapLibre started (or said plainly that it couldn't)
  await expect(page.locator('#pick-map .maplibregl-canvas, #pick-map.map-failed')).toHaveCount(1);
  await expect(page.locator('#pick-map .map-dot-bar')).toHaveCount(2);
  await page.getByLabel(/Nominatim Tavern/).check();
  await expect(page.locator('#pick-map .map-dot-bar.is-selected')).toHaveCount(1);
  // The browser logs the stubbed 502 itself; anything else is a real error
  expect(errors.filter((e) => !e.includes('status of 502'))).toEqual([]);
});

test('Overpass and Nominatim down shows made-up bars; a refused location shows Honolulu', async ({ page, context }) => {
  await stubNetwork(page, { overpassStatus: 429, nominatimStatus: 503 });
  await context.setGeolocation(HERE);
  await context.grantPermissions(['geolocation']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Find bars near me' }).click();
  await expect(page.locator('#pick-status')).toContainText('made-up demo bars, not real ones');
  await expect(page.locator('#pick-list li')).toHaveCount(8);

  await context.clearPermissions();
  await page.goto('./');
  // No geolocation permission granted: the browser refuses
  await page.getByRole('button', { name: 'Find bars near me' }).click();
  await expect(page.locator('#pick-status')).toContainText("real bars in Honolulu's Chinatown");
  await expect(page.getByLabel(/Bar 35/)).toBeVisible();
});

test('the demo plays itself to the vote, and friends vote without touching the link', async ({ page }) => {
  const { errors } = await stubNetwork(page);
  await page.goto('./?fast');
  await expect(page.locator('h1')).toHaveText('Vote on tonight');
  await expect(page.locator('#vote-list li')).toHaveCount(3);
  await expect(page.locator('#vote-list .place-name')).toHaveText(['Black Orchid', 'Black Shamrock Tavern', 'Bar Leather Apron']);
  await expect(page.locator('#demo-banner')).toContainText('This is a demo plan');
  // Until someone interacts, the demo map is the pre-rendered image, with no map engine loaded
  await expect(page.locator('#vote-map .static-map img')).toBeVisible();
  await expect(page.locator('#vote-map .map-dot-bar')).toHaveCount(3);
  // The image in index.html is the size DEMO_VIEW says, so the dots land on the right streets
  const img = await page.locator('#vote-map .static-map img').evaluate((el) => ({
    src: el.currentSrc, natural: [el.naturalWidth, el.naturalHeight], shown: [el.width, el.height], viewport: innerWidth,
  }));
  const size = img.viewport <= DEMO_VIEW.small.maxWidth ? DEMO_VIEW.small : DEMO_VIEW.large;
  expect(img.src).toContain(size === DEMO_VIEW.small ? 'demo-map-small' : 'demo-map-large');
  // naturalWidth is density-corrected: a 2x image of the right size reports the CSS size
  expect(img.natural).toEqual([size.width, size.height]);
  expect(img.shown).toEqual([size.width, size.height]);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('maplibre-gl')))).toBe(false);
  await expect(page.getByText("Friends' votes are simulated in this demo")).toBeVisible();
  const link = await page.locator('#share-link').inputValue();

  // ?fast runs the minute of fake voting in under a second
  const feed = page.getByRole('log');
  await expect(feed.locator('li').first()).toHaveText(FRIEND);
  await expect(async () => expect(await feed.locator('li').count()).toBeGreaterThanOrEqual(8)).toPass();
  await expect(page.locator('#vote-summary')).toContainText('so far');
  await expect(page.locator('#crowd-waiting')).toBeHidden();
  expect(await page.locator('#share-link').inputValue()).toBe(link);
  expect(linkVotes(link)).toEqual({});

  // A refresh brings back the same crowd
  await page.waitForTimeout(1500);
  const settled = await feed.locator('li').allTextContents();
  await page.reload();
  await expect(feed.locator('li')).toHaveText(settled);
  await axe(page);

  await takeOver(page);
  await expect(page.locator('#demo-banner')).toBeHidden();
  await expect(page.locator('#pick-list input:checked')).toHaveCount(0);
  // Taking over swaps in the live map
  await expect(page.locator('#pick-map .maplibregl-canvas, #pick-map.map-failed')).toHaveCount(1);
  await expect(page.locator('#pick-map .static-map')).toHaveCount(0);
  await expect(page.locator('#pick-map .map-dot-bar')).toHaveCount(11);
  await expect(page.locator('#pick-map .map-dot-you')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a tap stops the demo where it is', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('./');
  await expect(page.locator('#demo-banner')).toContainText('Tap anywhere to take over');
  await page.locator('.lede').first().click();
  await expect(page.locator('#demo-banner')).toBeHidden();
  await page.waitForTimeout(6500);
  await expect(page.locator('h1')).toHaveText('Where are we going tonight?');
});

test('with reduced motion the demo jumps straight to the vote', async ({ page }) => {
  await stubNetwork(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('h1')).toHaveText('Vote on tonight', { timeout: 2000 });
  await expect(page.locator('#vote-list li')).toHaveCount(3);
  // At real speed the first friend votes within about 2 seconds
  await expect(page.locator('#crowd-feed li').first()).toHaveText(FRIEND, { timeout: 3000 });
});

test('a shared plan link opens that plan and never autoplays', async ({ page, browser }) => {
  await stubNetwork(page);
  const link = (await demoPlanLink(page)).replace('?fast', '');
  const other = await browser.newPage();
  await stubNetwork(other);
  await other.goto(link);
  await expect(other.locator('h1')).toHaveText('Vote on tonight');
  await expect(other.locator('#demo-banner')).toBeHidden();
  await other.waitForTimeout(2000);
  expect(new URL(other.url()).hash).toBe(new URL(link).hash);
  await other.close();
});

test('votes from forked links merge on one device', async ({ page, browser }) => {
  await stubNetwork(page);
  const base = (await demoPlanLink(page)).replace('?fast', '');
  const names = await page.locator('#vote-list .place-name').allTextContents();

  // Two friends vote on the same original link, on their own phones
  const votes = [];
  for (const name of names.slice(0, 2)) {
    const phone = await browser.newPage();
    await stubNetwork(phone);
    await phone.goto(base);
    await voteButton(phone, name).click();
    await expect(voteButton(phone, name)).toContainText('yours');
    votes.push(await phone.locator('#share-link').inputValue());
    await phone.close();
  }
  // This device opens both forks and ends up with both votes
  await page.goto(votes[0]);
  await page.goto(votes[1]);
  await expect(page.locator('h1')).toHaveText('Vote on tonight');
  expect(Object.values(linkVotes(await page.locator('#share-link').inputValue()))).toEqual([1, 1]);
});

test('every page puts its h1 in the same place at the same size', async ({ page }) => {
  await stubNetwork(page);
  const measure = () => page.locator('h1').evaluate((h1) => ({ top: Math.round(h1.getBoundingClientRect().top), size: getComputedStyle(h1).fontSize }));
  await page.goto('./');
  await takeOver(page);
  const pick = await measure();
  await page.goto((await demoPlanLink(page)).replace('?fast', ''));
  await expect(page.locator('h1')).toHaveText('Vote on tonight');
  const vote = await measure();
  await page.goto('./#p=garbage');
  const broken = await measure();
  await page.goto('./404.html');
  const notFound = await measure();
  expect([vote, broken, notFound]).toEqual([pick, pick, pick]);
});

test('a mangled link says so, and missing pages get the 404', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('./#p=garbage');
  await expect(page.locator('h1')).toHaveText('This link is broken');
  const res = await page.goto('./no-such-page');
  expect(res.status()).toBe(404);
  // vite preview answers a bare 404; GitHub Pages serves 404.html, so check it directly
  await page.goto('./404.html');
  await expect(page.locator('h1')).toHaveText('Nothing here tonight');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  await axe(page);
});

for (const width of [320, 390]) {
  test(`no sideways scroll at ${width}px`, async ({ page }) => {
    await stubNetwork(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./?fast');
    await expect(page.locator('h1')).toHaveText('Vote on tonight');
    await expectNoSideScroll(page);
    await takeOver(page);
    await expectNoSideScroll(page);
  });
}

test('content stays in the centered column at 2560px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await stubNetwork(page);
  await page.setViewportSize({ width: 2560, height: 1400 });
  await page.goto('./');
  await takeOver(page);
  const box = await page.locator('#pick-view').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual((2560 - 1440) / 2 - 1);
  expect(box.x + box.width).toBeLessThanOrEqual((2560 + 1440) / 2 + 1);
});
