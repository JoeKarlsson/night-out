// Renders the static map images the autoplay demo shows before MapLibre
// loads, from the same OpenFreeMap style and view the live map uses.
// Run with `npm run demo-map` after changing DEMO_VIEW or the map style.
import { chromium } from '@playwright/test';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { DEMO_VIEW } from '../src/default-bars.js';
import { MAP_STYLE_URL } from '../src/map-style.js';

const dist = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;
const TYPES = { '.css': 'text/css', '.mjs': 'text/javascript', '.html': 'text/html' };

// MapLibre needs real HTTP for its worker, so serve the page and library locally
let pageHtml = '';
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname.slice(1);
  if (path === '') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(pageHtml);
  try {
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(new URL(path, dist)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

for (const [name, { width, height }] of Object.entries({ small: DEMO_VIEW.small, large: DEMO_VIEW.large })) {
  pageHtml = `<!doctype html><link rel="stylesheet" href="maplibre-gl.css"><body style="margin:0"><div id="map" style="width:${width}px;height:${height}px"></div>
<script type="module">
import * as m from './maplibre-gl.mjs';
const maplibregl = m.default ?? m;
maplibregl.setWorkerUrl('${origin}maplibre-gl-worker.mjs');
const map = new maplibregl.Map({ container: 'map', style: ${JSON.stringify(MAP_STYLE_URL)}, center: [${DEMO_VIEW.center[1]}, ${DEMO_VIEW.center[0]}],
  zoom: ${DEMO_VIEW.zoom}, interactive: false, attributionControl: false, fadeDuration: 0 });
map.on('error', (e) => console.error(e.error?.message));
map.once('idle', () => (window.ready = true));
</script>`;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  page.on('console', (msg) => msg.type() === 'error' && console.error(msg.text()));
  await page.goto(origin);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  const png = out(`demo-map-${name}.png`);
  await page.locator('#map').screenshot({ path: png });
  execFileSync('cwebp', ['-quiet', '-q', '72', png, '-o', out(`demo-map-${name}.webp`)]);
  rmSync(png);
  await page.close();
}
server.close();
await browser.close();
