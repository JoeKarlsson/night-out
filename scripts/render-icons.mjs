// Renders the PNG icons and the share card from public/favicon.svg.
// Run with `npm run icons` after changing the logo.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;
const bg = '#14111c';
const browser = await chromium.launch();
const page = await browser.newPage();

for (const [name, size, pad] of [
  ['favicon-32x32.png', 32, 0],
  ['apple-touch-icon.png', 180, 24],
  ['android-chrome-192x192.png', 192, 26],
  ['android-chrome-512x512.png', 512, 70],
]) {
  await page.setViewportSize({ width: size, height: size });
  const background = pad ? bg : 'transparent';
  await page.setContent(`<body style="margin:0;background:${background};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await page.screenshot({ path: out(name), omitBackground: !pad });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<body style="margin:0;background:${bg};width:1200px;height:630px;display:flex;align-items:center;gap:64px;padding:0 110px;box-sizing:border-box;font-family:system-ui,-apple-system,Helvetica,Arial,sans-serif;color:#f4f1f8">
  <div style="width:300px;height:300px;flex:none">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  <div><div style="font-size:104px;font-weight:800;line-height:1">Night Out</div>
  <div style="font-size:40px;line-height:1.25;margin-top:28px;color:#c9c3d6">Pick a few bars, send the link, let your friends vote</div></div></body>`);
await page.screenshot({ path: out('og.png') });
await browser.close();
