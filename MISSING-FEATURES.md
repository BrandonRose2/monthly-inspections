# Features present in the Manus build, absent from this repo

Recalled by Brandon while reviewing the migrated app. Each was verified as
genuinely absent from this repository — not lost during the Vercel migration.
The repo simply lagged behind the deployed Manus version.

Confirm each against the real Manus app once it is reachable again, rather
than rebuilding from memory: the behaviour details below are inferred.

## 1. The scraper itself

Downloads monthly inspection PDFs from MyLoneWorkers.

**Status:** rebuilt. Lives in `scraper/`, runs on the self-hosted macOS
runner via `.github/workflows/scrape-inspections.yml`. Recovered from
`inspections-app 4.zip`, which had never run end to end.

**Verified absent from the repo:** no scraper file in any of the 133 files
that have ever existed in this repository's history.

## 2. "Run Scraper" button

A button in the portal, with a parameters panel, that starts a scrape.

**Design for Vercel:** the serverless function cannot run Puppeteer, so the
button starts the existing GitHub Actions workflow rather than scraping
itself:

  portal button -> GitHub workflow_dispatch -> self-hosted Mac runner
  -> scrape -> ingestInspectionPdf -> portal

Needs: a fine-grained GitHub PAT with `actions:write` on this repo, stored as
a Vercel env var; `from_date` / `to_date` / `label` added as workflow inputs;
and a runner-status check so the button reports "runner offline" instead of
queueing forever.

**Open question:** which parameters did the original expose?

## 3. Named, saved scrape runs

The ability to name each scrape and keep it.

**Current model:** records are keyed by `(monthKey, region, property)`, so
there is exactly one dataset per month and re-scraping overwrites it.

**To build:** a `runs` table (`id`, `monthKey`, `label`, `createdAt`,
`source`) plus a `runId` foreign key on `inspection_records`; a run picker
beside the month/year selectors; a label passed through the ingest endpoint.

**Open questions:** does the checklist default to the newest run or a pinned
one? Do manual checkbox edits apply to a saved run or create a working copy?

**Worth doing early** — migrating existing records into runs later is harder
than starting with them.

## 4. Yearly / annual view

**Current:** month and year selectors with arrow navigation exist, and
`getHistory` returns a per-month summary (total, passed, failed, pdfs,
neither). There is no annual aggregate.

**To build:** group the existing summaries by year and total them. The data
is already there; this is a view, not a schema change.

---

Expect more. Four surfaced from memory in a single sitting, which suggests
the list is incomplete.
