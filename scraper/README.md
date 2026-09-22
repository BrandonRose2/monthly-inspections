# Monthly Inspections Scraper

Pulls a month of inspection activity from MyLoneWorkers, decides pass/fail
for every portal property, builds a PDF report for each property that had unit
scans, and files the result (status, reason, PDF) into the inspections portal.

This directory is **not** part of the Vercel deployment (see `.vercelignore`).
It runs on the self-hosted macOS GitHub Actions runner
(`.github/workflows/scrape-inspections.yml`), on the 22nd of each month and on
demand.

## How it decides

A unit scan is credited to the property **where it happened** (the
checkpoint's site), not to the manager login that did the scanning. Managers
cover each other's properties, so crediting by login got real months wrong:

| Sept 2026 | Old scraper | Now |
|---|---|---|
| Grace Townhomes login scanned 8 units at Breckenridge Village | Breckenridge failed | **pass** |
| Star Homes login only scanned Marrero 3 and Ruby Diamond | Star passed | Star **not inspected**; Marrero, Ruby Diamond **partial** |
| Lexington inspected on 9/22 | failed | **completed late** |

Each property gets one status, and every status comes with a written reason:

| Status | Checklist | Meaning |
|---|---|---|
| `pass` | ✓ | At least `MIN_UNITS` units scanned at the site by the 21st |
| `late` | ✓ | Enough units scanned, but finished after the 21st |
| `partial` | ✗ | Some units scanned, fewer than `MIN_UNITS` |
| `other_sites_only` | ✗ | The property's login scanned units, but at other properties |
| `tour_no_scans` | ✗ | A tour was started/finished with no unit scans |
| `no_activity` | ✗ | Nothing in MyLoneWorkers for the month |
| `not_on_myloneworkers` | — | Anaheim Gardens, Fairfax, Urban: left for manual review |

An existing PDF in the portal is never erased; a new report replaces it only
when the scraper has one to file.

## How it gets the data

1. Opens the Events Browser once with the runner's signed-in Chrome profile
   and borrows the API token the page itself uses (memory only, never logged).
2. Calls the same JSON endpoint the page calls
   (`POST ws.myloneworkers.com/api/v3/events/`) for every worker, 1st to end
   of month, with pagination. There is no clicking and no DOM selectors to break.
   `MOBILEFORMS` stays `false`: `true` means *only scans carrying a mobile
   form* and hides ordinary QR unit scans.
3. Attribution rules live in `lib/attribute.js` and are covered by
   `npm test`, which uses events modelled on real September 2026 data.

## One-time setup (on the runner)

```sh
cd scraper
npm install
npx puppeteer browsers install chrome
npm run setup:session      # sign in to MyLoneWorkers in the window that opens
```

Re-run `setup:session` if a scrape reports the session expired. No password is
stored anywhere; the only CI secret is `INGEST_TOKEN` (portal auth).

## Running

```sh
cd scraper
DRY_RUN=true MONTH=2026-09 npm run scrape                 # preview, files nothing
PORTAL_BASE_URL=https://… INGEST_TOKEN=… MONTH=2026-09 npm run scrape
```

| Variable | Default | |
|---|---|---|
| `MONTH` | current month | `YYYY-MM` |
| `DRY_RUN` | `false` | write `output/` only |
| `MIN_UNITS` | `3` | units needed for a pass (repo variable `MIN_UNITS` in CI) |
| `DUE_DAY` | `21` | deadline day |
| `TIME_ZONE` | `America/Los_Angeles` | the zone MyLoneWorkers displays |
| `ONLY` | all | comma-separated portal properties to file, e.g. `Lexington,Breckenridge` |
| `HEADLESS` | `true` | `false` to watch the token step |

Output: `output/results.json` (every property, its status and reason, plus any
unmapped sites) and `output/pdfs/<month>/`. CI keeps both as a run artifact
for 90 days.

## Keeping the mappings current

- **`site-map.json`**: MyLoneWorkers site name → portal property. Sites not
  listed are matched by name automatically. Anything that still cannot be
  matched is printed at the end of the run and listed under `unmatchedSites`;
  add it here.
- **`workers.json` / `property-map.json`**: which login belongs to which
  property. Used only to explain failures ("this login scanned elsewhere",
  "tour with no scans"), never to award a pass.
- **`portal-properties.json`**: mirror of `REGIONS` in
  `client/src/pages/Home.tsx`; a test fails if they drift apart.
