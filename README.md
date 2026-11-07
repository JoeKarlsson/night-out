# Night Out

Pick a few bars near you, send your friends the link, and let everyone vote on where you're going tonight.

Live at https://night-out.joekarlsson.com

## How it works

1. **Find bars near me** asks for your location and looks up bars, pubs, beer gardens and breweries within about a mile and a half, using [OpenStreetMap](https://www.openstreetmap.org/copyright) data through the public [Overpass API](https://overpass-api.de/), or OSM's [Nominatim](https://nominatim.org/) search when Overpass is down or slow (it often is). The map is [OpenFreeMap](https://openfreemap.org/)'s dark style drawn with [MapLibre GL JS](https://maplibre.org/), loaded only when a map is first shown. **Try it with demo bars** skips the location prompt.
2. Tick two or more and start the vote.
3. Send the link. Friends tap a bar to vote.

There's no server. The whole plan, votes included, is encoded in the link (`#p=…`). When someone votes, the link on their screen updates; they send that new link back to the group, and the next person votes on top of it. Each phone remembers its own vote in `localStorage`, so changing your mind moves your vote instead of adding one.

That means two friends voting on the same old link at the same time will each end up with a link that has only their own vote. That's the trade for running on a static host; the 2015 version used Meteor and MongoDB for live voting.

### Simulated friends

So the vote page feels live without a server, three to six made-up friends vote over the first minute after a plan opens, and now and then one changes their mind. The page says so: "Friends' votes are simulated in this demo." Their votes are added on screen only and never go into the share link. The crowd is seeded by the plan's id, so a refresh brings back the same people at the same times. Add `?fast` to the URL to run the minute in under a second (the e2e tests use it).

### When things fail

If both Overpass and Nominatim fail, Overpass finds nothing, or location is refused, the app shows a list of made-up demo bars (labeled as such) so the flow still works.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (node:test)
npm run test:e2e   # Playwright: desktop Chrome, Pixel, iPhone WebKit, with axe
npm run icons      # re-render PNG icons and og.png from public/favicon.svg
```

The e2e tests stub the map style, Overpass and Nominatim, so they make no outside requests.

## Deploy

Pushing to `master` runs the tests, builds with Vite and deploys to GitHub Pages (`.github/workflows/ci.yml`). The custom domain is set in the repo's Pages settings; the workflow passes the Pages base path to the build, so the site also works under `/night-out/` if the domain is ever removed.

## Privacy

Your approximate location is sent to Overpass (or Nominatim) only when you tap **Find bars near me**. Map tiles come from tiles.openfreemap.org, which sees the area you're looking at. Visits are counted with cookie-free, self-hosted Plausible. No accounts, nothing stored on a server.

## Credits

First built in 2015 by Joe Karlsson, Jessie Copeland, Alex Anich, Brian "Boots" and Nolan "Skinny Fatman". Rebuilt as a static site in 2026.

Map data © OpenStreetMap contributors, ODbL. Map tiles from OpenFreeMap, built on OpenMapTiles.
