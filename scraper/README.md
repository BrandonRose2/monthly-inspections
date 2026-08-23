# Monthly Inspections Scraper

Downloads monthly inspection PDFs from MyLoneWorkers and files them into the
inspections portal.

This directory is **not** part of the Vercel deployment (see `.vercelignore`).
It runs on the self-hosted macOS GitHub Actions runner, because the scrape needs
a real browser holding a signed-in MyLoneWorkers session.

## How credentials are handled

No MyLoneWorkers password is stored in this repo, in CI secrets, or in the
environment. You sign in once by hand and the session persists in a browser
profile directory on the runner:

```sh
cd scraper
npm install
npx puppeteer browsers install chrome   # npm's allow-scripts blocks Puppeteer's
                                        # postinstall, which normally does this
npm run setup:session
```

A browser window opens; sign in there. Re-run this if a scrape reports that the
session expired.

The only secret CI needs is `INGEST_TOKEN`, which authenticates the scraper to
the portal — it grants no access to MyLoneWorkers.

## Running a scrape

```sh
cd scraper
PORTAL_BASE_URL=https://monthly-inspections.vercel.app INGEST_TOKEN=... npm run scrape
```

Add `DRY_RUN=true` to scrape without filing anything into the portal, or
`HEADLESS=false` to watch it work.

## Property name mapping

`property-map.json` maps MyLoneWorkers property names to the portal's canonical
`{ region, property }` pairs. The portal names must match `REGIONS` in
`client/src/pages/Home.tsx` exactly, or a scraped record will not line up with
the row shown in the UI.

Two MyLoneWorkers reports cover two portal properties each
(`Howell Place - Pirates Bend`, `North Pointe - Bayou Pointe`); the same PDF is
filed against both. `NWA` is the MyLoneWorkers name for the portal's
`Wilmington`. Three portal properties have no MyLoneWorkers source at all
(Anaheim Gardens, Fairfax, Urban).

## Selector status

The scrape flow was recovered from a draft that had never run end to end — it
used jQuery (`:contains`) and Playwright (`:has-text`) selector syntax that
Puppeteer rejects as malformed CSS, so it would have thrown at login. The flow,
date window, and worker mapping are faithful to that draft, but the DOM
selectors are unverified against the live site.

Every failure writes a full-page screenshot and the page HTML to
`diagnostics/`, and the workflow uploads them as an artifact. Use those to
correct selectors from real evidence rather than guessing.
