import { test, expect } from '@playwright/test';

// Visual baselines for the parts that don't change between runs. They are
// rendered on Linux (CI, or the Playwright Docker image locally: see README),
// so they only run there.
test.skip(process.platform !== 'linux', 'Baselines are rendered on Linux');

const STYLE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#45516e' } }] };
const shot = { animations: 'disabled', maxDiffPixelRatio: 0.01 };

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ json: STYLE }));
  await page.route('https://plausible.joekarlsson.io/**', (r) => r.fulfill({ body: '' }));
});

test('home: header, demo banner, footer', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.site-header')).toHaveScreenshot('header.png', shot);
  await expect(page.locator('#demo-banner')).toHaveScreenshot('demo-banner.png', shot);
  await expect(page.locator('.site-footer')).toHaveScreenshot('footer.png', shot);
});

test('pick list of Honolulu bars', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Start your own plan' }).click();
  await expect(page.locator('#pick-form')).toHaveScreenshot('pick-list.png', shot);
});

test('404 page', async ({ page }) => {
  await page.goto('./404.html');
  await expect(page.locator('main')).toHaveScreenshot('404.png', shot);
});
