/**
 * Reports a run's progress to the portal's Scrape Activity panel.
 *
 * Progress is best-effort: a failed report is logged and the scrape carries
 * on, because filing results matters more than the progress bar.
 */
function makeReporter({ portalBaseUrl, ingestToken, enabled, fetchImpl = fetch, log = console }) {
  let id = null;
  let lastError = null;

  async function call(procedure, json) {
    const res = await fetchImpl(`${portalBaseUrl}/api/trpc/scraper.${procedure}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ingestToken}` },
      body: JSON.stringify({ json }),
    });
    const text = await res.text();
    if (!res.ok || text.includes('"error"')) throw new Error(`${procedure} failed (${res.status}): ${text.slice(0, 200)}`);
    return JSON.parse(text).result?.data?.json;
  }

  const warn = err => {
    if (lastError !== err.message) log.warn(`  (progress not reported: ${err.message})`);
    lastError = err.message;
  };

  return {
    get id() { return id; },

    async begin({ runId, startMonthKey, endMonthKey, properties, githubRunUrl }) {
      if (!enabled) return null;
      try {
        const out = await call('begin', { runId, startMonthKey, endMonthKey, properties, githubRunUrl });
        id = out?.id ?? runId ?? null;
      } catch (err) {
        warn(err);
        id = runId ?? null;
      }
      return id;
    },

    async update(patch) {
      if (!enabled || id == null) return;
      try {
        await call('progress', { id, ...patch });
      } catch (err) {
        warn(err);
      }
    },
  };
}

module.exports = { makeReporter };
