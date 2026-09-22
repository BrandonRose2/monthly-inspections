/**
 * Turn a month of MyLoneWorkers events into one result per portal property.
 *
 * The rule the old scraper got wrong: a unit scan belongs to the property
 * where it HAPPENED (its checkpoint's site), not to whichever manager's login
 * did the scanning. Managers regularly cover each other's properties — in
 * Sept 2026 the Grace Townhomes login inspected Breckenridge Village, and the
 * Star Homes login only scanned units at Marrero 3 and Ruby Diamond.
 *
 * Pure function: no I/O, so it can be tested against recorded events.
 */
const { formatLocalDate } = require('./time');

const SCAN_TYPES = new Set(['SCAN', 'NFCSCAN', 'BEACONSCAN', 'VCPSCAN']);
const TOUR_TYPES = new Set(['START', 'FINISH']);
const STOPWORDS = new Set(['apts', 'apt', 'apartments', 'apartment', 'the', 'of', 'on', 'at', 'and']);

function normTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/** MyLoneWorkers reports a checkpoint's client as "Client - Site". */
function siteCandidates(client) {
  const full = String(client || '').trim();
  if (!full) return [];
  const parts = full.split(' - ').map(s => s.trim());
  if (parts.length % 2 === 0) {
    const half = parts.length / 2;
    const left = parts.slice(0, half).join(' - ');
    const right = parts.slice(half).join(' - ');
    if (left === right) return [left, full];
  }
  return [...new Set([full, parts[0], parts[parts.length - 1]])];
}

/**
 * Build a resolver from site name -> [{ region, property }].
 * Explicit site-map entries win; otherwise match portal property names as
 * whole-word sequences inside the site name.
 */
function makeSiteResolver({ portal, siteMap }) {
  const regionOf = {};
  for (const [region, props] of Object.entries(portal.regions)) {
    for (const p of props) regionOf[p] = region;
  }
  const toDest = p => {
    if (!regionOf[p]) throw new Error(`site-map.json points at "${p}", which is not a portal property`);
    return { region: regionOf[p], property: p };
  };

  const explicit = {};
  for (const [site, target] of Object.entries(siteMap.sites || {})) {
    explicit[site.toLowerCase()] = (Array.isArray(target) ? target : [target]).map(toDest);
  }

  // Portal names as token sequences. "Windsor / Yorkshire" matches either half.
  const patterns = [];
  for (const p of Object.keys(regionOf)) {
    for (const alt of p.split('/')) {
      const toks = normTokens(alt);
      if (toks.length) patterns.push({ property: p, toks });
    }
  }

  const cache = new Map();
  return function resolve(client) {
    if (cache.has(client)) return cache.get(client);
    const cands = siteCandidates(client);
    let result = null;

    for (const c of cands) {
      if (explicit[c.toLowerCase()]) { result = explicit[c.toLowerCase()]; break; }
    }

    if (!result) {
      const hay = normTokens(cands[0]);
      const hits = [];
      for (const pat of patterns) {
        for (let i = 0; i + pat.toks.length <= hay.length; i++) {
          if (pat.toks.every((t, j) => hay[i + j] === t)) hits.push({ ...pat, start: i, end: i + pat.toks.length });
        }
      }
      // Longest matches first; keep non-overlapping ones so a combined site
      // ("North Pointe - Bayou Pointe") credits both properties.
      hits.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      const used = new Set();
      const chosen = new Set();
      for (const h of hits) {
        const span = [...Array(h.end - h.start).keys()].map(k => h.start + k);
        if (span.some(s => used.has(s))) continue;
        span.forEach(s => used.add(s));
        chosen.add(h.property);
      }
      if (chosen.size) result = [...chosen].map(toDest);
    }

    cache.set(client, result);
    return result;
  };
}

/** Worker ID -> portal properties they are assigned to (via workers.json + property-map.json). */
function makeWorkerIndex({ workers, propertyMap }) {
  const byId = {};
  for (const w of workers.workers || []) {
    const dest = propertyMap[w.property];
    const dests = dest ? (Array.isArray(dest) ? dest : [dest]) : [];
    byId[w.id] = { name: w.name, dests };
  }
  return byId;
}

function workerIdOf(guardDetails) {
  const m = /\(([0-9a-f]{10})\)\s*$/i.exec(guardDetails || '');
  return m ? m[1].toLowerCase() : null;
}

function workerNameOf(guardDetails) {
  return String(guardDetails || '').replace(/\s*\([0-9a-f]{10}\)\s*$/i, '').trim() || 'unknown worker';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function listNames(names) {
  const u = [...new Set(names)];
  if (u.length <= 2) return u.join(' and ');
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}

/**
 * @returns {{ results: object[], unmatchedSites: object[], unknownWorkers: string[] }}
 */
function attribute({ events, windows, portal, siteMap, workers, propertyMap, minUnits = 3 }) {
  const tz = windows.timeZone;
  const resolveSite = makeSiteResolver({ portal, siteMap });
  const workerIndex = makeWorkerIndex({ workers, propertyMap });
  const skipped = new Set(portal.not_on_myloneworkers || []);

  const per = {};
  const keyOf = d => `${d.region}::${d.property}`;
  for (const [region, props] of Object.entries(portal.regions)) {
    for (const property of props) {
      per[keyOf({ region, property })] = {
        region, property,
        onTime: [], late: [],          // unit scans at this property
        ownWorkerEvents: [],           // anything done by this property's assigned logins
      };
    }
  }

  const unmatched = new Map();
  const unknownWorkers = new Set();

  for (const e of events) {
    if (e.scanTimestamp < windows.start || e.scanTimestamp > windows.monthEnd) continue;
    const wid = workerIdOf(e.guard_details);
    const worker = wid ? workerIndex[wid] : null;
    if (!worker && e.guard_details) unknownWorkers.add(e.guard_details);

    if (worker) {
      for (const d of worker.dests) per[keyOf(d)]?.ownWorkerEvents.push(e);
    }

    if (!SCAN_TYPES.has(e.snapshot)) continue;
    const client = e.checkpoint?.client;
    if (!client) continue;
    const dests = resolveSite(client);
    if (!dests) {
      const u = unmatched.get(client) || { site: client, scans: 0, workers: new Set() };
      u.scans++;
      u.workers.add(workerNameOf(e.guard_details));
      unmatched.set(client, u);
      continue;
    }
    const bucket = e.scanTimestamp <= windows.dueEnd ? 'onTime' : 'late';
    for (const d of dests) per[keyOf(d)][bucket].push(e);
  }

  const results = [];
  for (const p of Object.values(per)) {
    if (skipped.has(p.property)) {
      results.push({ region: p.region, property: p.property, status: 'not_on_myloneworkers', skip: true,
        note: 'Not tracked in MyLoneWorkers — review manually.' });
      continue;
    }

    const units = list => new Set(list.map(e => e.checkpoint?.ID ?? e.checkpoint?.name ?? e.ID));
    const onTimeUnits = units(p.onTime);
    const allUnits = units([...p.onTime, ...p.late]);
    const inspectors = [...new Set([...p.onTime, ...p.late].map(e => workerNameOf(e.guard_details)))];
    const days = list => [...new Set(list.map(e => formatLocalDate(e.scanTimestamp, tz)))];
    const by = inspectors.length ? ` by ${listNames(inspectors)}` : '';

    let status, note;
    if (onTimeUnits.size >= minUnits) {
      status = 'pass';
      note = `${onTimeUnits.size} unit${onTimeUnits.size === 1 ? '' : 's'} scanned ${days(p.onTime).join(', ')}${by}.`;
    } else if (allUnits.size >= minUnits && p.late.length) {
      status = 'late';
      note = `Completed LATE: ${allUnits.size} units scanned, finishing ${days(p.late).slice(-1)[0]} (due the ${ordinal(windows.dueDay)})${by}.`;
    } else if (allUnits.size > 0) {
      status = 'partial';
      note = `Only ${allUnits.size} unit${allUnits.size === 1 ? '' : 's'} scanned (${days([...p.onTime, ...p.late]).join(', ')})${by} — expected at least ${minUnits}.`;
    } else {
      const own = p.ownWorkerEvents;
      const ownScans = own.filter(e => SCAN_TYPES.has(e.snapshot) && e.checkpoint?.client);
      const ownTours = own.filter(e => TOUR_TYPES.has(e.snapshot));
      if (ownScans.length) {
        const elsewhere = [...new Set(ownScans.flatMap(e => (resolveSite(e.checkpoint.client) || [{ property: siteCandidates(e.checkpoint.client)[0] }]).map(d => d.property)))];
        status = 'other_sites_only';
        note = `No units scanned here. This property's login scanned ${listNames(elsewhere)} instead (${days(ownScans).join(', ')}).`;
      } else if (ownTours.length) {
        status = 'tour_no_scans';
        note = `Tour started/finished on ${days(ownTours).join(', ')} but no units were scanned.`;
      } else {
        status = 'no_activity';
        note = `No MyLoneWorkers activity between the 1st and the ${ordinal(windows.dueDay)}.`;
      }
    }

    results.push({
      region: p.region,
      property: p.property,
      status,
      checked: status === 'pass' || status === 'late',
      xed: !(status === 'pass' || status === 'late'),
      note,
      units: allUnits.size,
      onTimeUnits: onTimeUnits.size,
      inspectors,
      scans: [...p.onTime, ...p.late].sort((a, b) => a.scanTimestamp - b.scanTimestamp),
      tourEvents: p.ownWorkerEvents.filter(e => TOUR_TYPES.has(e.snapshot)),
    });
  }

  return {
    results,
    unmatchedSites: [...unmatched.values()].map(u => ({ site: u.site, scans: u.scans, workers: [...u.workers] })),
    unknownWorkers: [...unknownWorkers],
  };
}

module.exports = { attribute, makeSiteResolver, siteCandidates, normTokens, workerIdOf, SCAN_TYPES };
