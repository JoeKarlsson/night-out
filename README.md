# Night Out

Pick a few bars near you, send your friends the link, and let everyone vote on where you're going tonight.

Live at https://night-out.joekarlsson.com

## How it works

Open the site with no plan in the link and the demo plays itself: real bars in Honolulu's Chinatown (where Night Out began, from an OpenStreetMap snapshot in `src/default-bars.js`), three get picked a second and a half apart, the vote opens and made-up friends start voting. A banner says it's a demo. Any click, tap or key stops it where it is, and **Start your own plan** clears it. With reduced motion on, it skips straight to the vote. A shared plan link never autoplays.

1. **Find bars near me** asks for your location (waiting at most 5 seconds; if the answer doesn't come, it shows the Honolulu bars and offers **Use my location** if your location turns up later) and looks up bars, pubs, beer gardens and breweries within about a mile and a half, using [OpenStreetMap](https://www.openstreetmap.org/copyright) data through the public [Overpass API](https://overpass-api.de/), or OSM's [Nominatim](https://nominatim.org/) search when Overpass is down or slow (it often is). The map is [OpenFreeMap](https://openfreemap.org/)'s dark style drawn with [MapLibre GL JS](https://maplibre.org/), loaded only when a map is first shown. **Try it with demo bars** skips the location prompt.
2. Tick two or more and start the vote.
3. Send the link. Friends tap a bar to vote.

There's no server. The whole plan, votes included, is encoded in the link (`#p=…`). When someone votes, the link on their screen updates; they send that new link back to the group, and the next person votes on top of it. Each phone remembers its own vote in `localStorage`, so changing your mind moves your vote instead of adding one.

That means two friends voting on the same old link at the same time will each end up with a link that has only their own vote. Each device keeps a tally per plan and merges every link for that plan it opens (each bar keeps its highest count), which recovers votes from forked links once someone opens both. It's a partial fix: when two forks each added a vote for the same bar, the merge counts one, and nobody sees the merged count until a link carrying it reaches them. That's the trade for running on a static host; the 2015 version used Meteor and MongoDB for live voting.

### Simulated friends

So the vote page feels live without a server, three to six made-up friends vote over the first minute after a plan opens (starting a few seconds in for the autoplay demo), and now and then one changes their mind. The page says so: "Friends' votes are simulated in this demo." Their votes are added on screen only and never go into the share link. The crowd is seeded by the plan's id, so a refresh brings back the same people at the same times. Add `?fast` to the URL to run the minute in under a second (the e2e tests use it).

### When things fail

The whole bar search gets 8 seconds. After 3 the status says it's still looking.

If both Overpass and Nominatim fail, Overpass finds nothing, or location is refused, the app shows a list of made-up demo bars (labeled as such) so the flow still works.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (node:test)
npm run test:e2e   # Playwright: desktop Chrome, Pixel, iPhone WebKit, with axe
npm run icons      # re-render PNG icons and og.png from public/favicon.svg
npm run demo-map   # re-render the demo's static map images (needs cwebp)
```

Visual baselines (`e2e/visual.spec.js-snapshots/`) are rendered on Linux, so those tests skip on a Mac. To update them after a design change, run them in the Playwright image that matches `@playwright/test`:

```bash
docker run --rm -v "$PWD":/src:ro -v "$PWD/e2e":/out mcr.microsoft.com/playwright:v1.65.0-noble bash -c '
  mkdir /work && cd /src && tar --exclude=node_modules --exclude=dist --exclude=.git -cf - . | (cd /work && tar xf -) && cd /work &&
  npm ci && CI=1 npx playwright test e2e/visual.spec.js --update-snapshots &&
  rm -rf /out/visual.spec.js-snapshots && cp -r e2e/visual.spec.js-snapshots /out/'
```

CI runs the unit, e2e, axe and visual tests, checks every link in the built pages with lychee, deploys, then checks the live site from outside (pages, 404, redirect, `security.txt`).

The e2e tests stub the map style, Overpass and Nominatim, so they make no outside requests.

### Why the demo map is a picture

The autoplay demo shows a pre-rendered image of the Honolulu map (`public/demo-map-*.webp`) with the bars drawn on top in CSS, positioned with the same Web Mercator math the map uses. MapLibre is about 300 KB gzipped and its startup blocked a mid-range phone's main thread for over a second and a half; the picture costs 40 to 80 KB. The first click, tap, key or scroll, or any other location, swaps in the live map.

## Deploy

Pushing to `master` runs the tests, builds with Vite and deploys to GitHub Pages (`.github/workflows/ci.yml`). The custom domain is set in the repo's Pages settings; the workflow passes the Pages base path to the build, so the site also works under `/night-out/` if the domain is ever removed.

## Privacy

Your approximate location is sent to Overpass (or Nominatim) only when you tap **Find bars near me**. Map tiles come from tiles.openfreemap.org, which sees the area you're looking at. Visits are counted with cookie-free, self-hosted Plausible. No accounts, nothing stored on a server.

## Credits

First built in 2015 by Joe Karlsson, Jessie Copeland, Alex Anich, Brian "Boots" and Nolan "Skinny Fatman". Rebuilt as a static site in 2026.

Map data © OpenStreetMap contributors, ODbL. Map tiles from OpenFreeMap, built on OpenMapTiles.
