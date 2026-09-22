/**
 * Minimal client for the MyLoneWorkers events API — the same endpoint the
 * Events Browser page calls. Request shape verified against the live site
 * (Sept 2026).
 *
 * Two flags matter and are easy to get wrong:
 *   MOBILEFORMS: true  means "ONLY scans that carry a mobile form". It hides
 *                      ordinary QR unit scans, so it must stay false.
 *   GEOFENCE:    true  likewise narrows the results; keep it false.
 */
const API_URL = process.env.MLW_API_URL || 'https://ws.myloneworkers.com/api/v3/events/';
const PAGE_SIZE = 100;

function eventsQuery({ guardIds, from, to, limit = PAGE_SIZE, offset = 0 }) {
  return {
    guard_ids: guardIds,
    fromDate: from,
    toDate: to,
    guard_details: '',
    tour_details: '',
    event_details: '',
    checkpoint_details: '',
    START: true,
    TEST: true,
    FINISH: true,
    INCIDENT: true,
    MME: true,
    MANDOWN: true,
    SOS: true,
    SCAN: true,
    NFCSCAN: true,
    BEACONSCAN: true,
    BEACONFOUND: true,
    BEACONLOST: true,
    VCPSCAN: true,
    GEOFENCE: false,
    MOBILEFORMS: false,
    MISSEDSCAN: true,
    OUTMSG: true,
    want_count: false,
    display_guards: true,
    last_transaction_id: 0,
    orderScanTimestamp: 'DESC', // the value the site itself sends; we sort locally

    orderPatrolID: null,
    orderSnapshot: null,
    clientID: -1,
    siteID: -1,
    limit,
    offset,
  };
}

class SessionExpiredError extends Error {}

async function postEvents(token, body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-access-token': token },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    throw new SessionExpiredError(`MyLoneWorkers rejected the session (${res.status})`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`MyLoneWorkers events API ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MyLoneWorkers events API returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/** Fetch every event for the given workers in [from, to], following pagination. */
async function fetchAllEvents(token, { guardIds, from, to }) {
  const count = await postEvents(token, { ...eventsQuery({ guardIds, from, to }), want_count: true });
  const expected = typeof count?.total === 'number' ? count.total : null;

  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await postEvents(token, eventsQuery({ guardIds, from, to, offset }));
    if (!Array.isArray(page)) throw new Error(`unexpected events payload: ${JSON.stringify(page).slice(0, 200)}`);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset > 100000) throw new Error('pagination did not terminate');
  }

  if (expected !== null && expected !== all.length) {
    console.warn(`  note: API count said ${expected} events, pagination returned ${all.length}`);
  }
  // De-duplicate by event ID in case new events shifted a page boundary mid-run.
  const byId = new Map(all.map(e => [e.ID, e]));
  return [...byId.values()].sort((a, b) => a.scanTimestamp - b.scanTimestamp);
}

module.exports = { fetchAllEvents, eventsQuery, SessionExpiredError, API_URL };
