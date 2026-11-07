import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const HERE = { latitude: 44.9778, longitude: -93.265 };
const overpass = {
  elements: [
    { type: 'node', id: 1, lat: 44.979, lon: -93.266, tags: { amenity: 'bar', name: 'Test Tavern' } },
    { type: 'node', id: 2, lat: 44.976, lon: -93.262, tags: { amenity: 'pub', name: 'Fake & Firkin <b>' } },
    { type: 'way', id: 3, center: { lat: 44.981, lon: -93.27 }, tags: { craft: 'brewery', name: 'Mock Brewing' } },
  ],
};
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// No real network in tests: OSM tiles and Overpass are stubbed, and any other
// third-party request fails the test.
async function stubNetwork(page, { overpassStatus = 200 } = {}) {
  const failed = [];
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ body: TILE, contentType: 'image/png' }));
  await page.route('https://overpass-api.de/**', (r) =>
    overpassStatus === 200 ? r.fulfill({ json: overpass }) : r.fulfill({ status: overpassStatus, body: 'busy' }),
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
  await expect(page.locator('#vote-summary')).toHaveText('2 bars, no votes yet.');
  await axe(page);
  await expectNoSideScroll(page);

  await page.getByRole('button', { name: /Mock Brewing/ }).click();
  await expect(page.locator('#vote-summary')).toContainText('Mock Brewing is winning');
  await page.getByRole('button', { name: /Test Tavern/ }).click();
  await expect(page.locator('#vote-summary')).toContainText('1 vote so far. Test Tavern is winning');

  // A friend opens the shared link on another phone and votes too
  const link = await page.locator('#share-link').inputValue();
  expect(link).toContain('#p=');
  if (browserName === 'chromium') {
    await page.getByRole('button', { name: 'Copy link' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  }
  const friend = await context.browser().newPage();
  await stubNetwork(friend);
  await friend.goto(link);
  await friend.getByRole('button', { name: /Test Tavern/ }).click();
  await expect(friend.locator('#vote-summary')).toContainText('2 votes so far. Test Tavern is winning');
  await friend.close();

  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('Overpass down or location refused falls back to demo bars', async ({ page }) => {
  await stubNetwork(page, { overpassStatus: 429 });
  await page.goto('./');
  // No geolocation permission granted: the browser refuses
  await page.getByRole('button', { name: 'Find bars near me' }).click();
  await expect(page.locator('#pick-status')).toContainText('demo bars');
  await expect(page.locator('#pick-list li')).toHaveCount(8);

  await page.getByRole('button', { name: 'Try it with demo bars' }).click();
  await expect(page.locator('#pick-status')).toContainText('Honolulu');
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
    await page.goto('./');
    await page.getByRole('button', { name: 'Try it with demo bars' }).click();
    await expectNoSideScroll(page);
  });
}

test('content stays in the centered column at 2560px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await stubNetwork(page);
  await page.setViewportSize({ width: 2560, height: 1400 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Try it with demo bars' }).click();
  const box = await page.locator('#pick-view').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual((2560 - 1440) / 2 - 1);
  expect(box.x + box.width).toBeLessThanOrEqual((2560 + 1440) / 2 + 1);
});
