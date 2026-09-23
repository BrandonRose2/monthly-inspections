const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { attribute, makeSiteResolver, siteCandidates } = require('../lib/attribute');
const { monthWindows } = require('../lib/time');
const { septemberEvents, TZ } = require('./fixtures');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const portal = read('portal-properties.json');
const siteMap = read('site-map.json');
const workers = read('workers.json');
const rawMap = read('property-map.json');
const propertyMap = { ...rawMap.confirmed, ...rawMap.needs_confirmation };

function run(events = septemberEvents(), minUnits = 3) {
  const windows = monthWindows('2026-09', { timeZone: TZ });
  const out = attribute({ events, windows, portal, siteMap, workers, propertyMap, minUnits });
  const by = Object.fromEntries(out.results.map(r => [r.property, r]));
  return { ...out, by };
}

test('scans are credited to the site where they happened, not the login', () => {
  const { by } = run();
  assert.equal(by['Breckenridge Village'].status, 'pass');
  assert.equal(by['Breckenridge Village'].units, 8);
  assert.match(by['Breckenridge Village'].note, /Grace Townhomes Manager/);
  assert.equal(by['Grace Townhomes'].status, 'pass');
  assert.equal(by['Grace Townhomes'].units, 7);
});

test("a login that only scanned other properties does not pass its own", () => {
  const { by } = run();
  assert.equal(by['Star Homes'].status, 'other_sites_only');
  assert.equal(by['Star Homes'].xed, true);
  assert.match(by['Star Homes'].note, /Marrero/);
  assert.match(by['Star Homes'].note, /Ruby Diamond/);
});

test('one or two units is partial, not a pass', () => {
  const { by } = run();
  assert.equal(by['Marrero 3'].status, 'partial');
  assert.equal(by['Ruby Diamond'].status, 'partial');
  assert.equal(by['Marrero 3'].checked, false);
});

test('an inspection finished after the 21st is marked late but done', () => {
  const { by } = run();
  assert.equal(by['Lexington'].status, 'late');
  assert.equal(by['Lexington'].checked, true);
  assert.equal(by['Lexington'].onTimeUnits, 1); // the stray 9/17 scan
  assert.match(by['Lexington'].note, /LATE/);
});

test('a tour with no unit scans is flagged with that reason', () => {
  const { by } = run();
  assert.equal(by['Grove Park Terrace'].status, 'tour_no_scans');
  assert.match(by['Grove Park Terrace'].note, /no units were scanned/);
});

test('normal on-time inspection passes', () => {
  const { by } = run();
  assert.equal(by['River Pointe'].status, 'pass');
  assert.equal(by['River Pointe'].units, 12);
  assert.equal(by['River Pointe'].forms, 5);
  assert.match(by['River Pointe'].note, /5 inspection forms filed/);
  assert.doesNotMatch(by['Breckenridge Village'].note, /forms filed/);
});

test('properties with no activity say so, and off-platform ones are skipped', () => {
  const { by } = run();
  assert.equal(by['Coral Village'].status, 'no_activity');
  assert.match(by['Coral Village'].note, /21st/);
  assert.equal(by['Fairfax'].skip, true);
});

test('every property gets a reason', () => {
  const { results } = run();
  const total = Object.values(portal.regions).flat().length;
  assert.equal(results.length, total);
  for (const r of results) assert.ok(r.note && r.note.length > 10, `${r.property} has no note`);
});

test('unmapped sites are reported instead of silently dropped', () => {
  const { unmatchedSites } = run();
  assert.deepEqual(unmatchedSites.map(u => u.site), ['Brand New Place - Brand New Place']);
});

test('site names resolve by name when not in the explicit map', () => {
  const resolve = makeSiteResolver({ portal, siteMap });
  const names = c => (resolve(c) || []).map(d => d.property).sort();
  assert.deepEqual(names('Silver Springs Terrace - Silver Springs Terrace'), ['Silver Springs']);
  assert.deepEqual(names('Gates On Manhattan - Gates On Manhattan'), ['The Gates on Manhattan']);
  assert.deepEqual(names('Windsor Apts - Windsor Apts'), ['Windsor / Yorkshire']);
  assert.deepEqual(names('River Gardens - River Gardens'), ['River Garden']);
  assert.deepEqual(names('North Pointe - Bayou Pointe'), ['Bayou Pointe', 'North Pointe']);
  assert.deepEqual(names('Starbucks - Starbucks'), []);
  // Earlier short names still match, and new full names match too.
  assert.deepEqual(names('Thibodaux - Thibodaux'), ['Thibodaux Colonial Estates']);
  assert.deepEqual(names('Anaheim Apts - Anaheim Apts'), ['Anaheim Apts']);
  assert.deepEqual(names('Cumberland Apts - Cumberland Apts'), ['Cumberland Apts']);
});

test('client strings of the form "X - X" collapse to X', () => {
  assert.deepEqual(siteCandidates('Lexington Arms - Lexington Arms'), ['Lexington Arms', 'Lexington Arms - Lexington Arms']);
});

test('site-map targets are all real portal properties', () => {
  const all = new Set(Object.values(portal.regions).flat());
  for (const [site, target] of Object.entries(siteMap.sites)) {
    for (const t of [].concat(target)) assert.ok(all.has(t), `${site} -> ${t} is not a portal property`);
  }
});
