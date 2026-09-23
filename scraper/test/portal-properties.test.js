const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const shared = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'properties.ts'), 'utf8');
const mine = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'portal-properties.json'), 'utf8'));

const quoted = s => [...s.matchAll(/"([^"]+)"/g)].map(x => x[1]);

test('portal-properties.json regions match REGIONS in shared/properties.ts', () => {
  const ui = {};
  for (const m of shared.matchAll(/\{\s*name:\s*"([^"]+)",\s*properties:\s*\[([^\]]*)\]\s*\}/g)) ui[m[1]] = quoted(m[2]);
  assert.ok(Object.keys(ui).length >= 4, 'could not parse REGIONS from shared/properties.ts');
  assert.deepEqual(mine.regions, ui);
});

test('portal-properties.json not_on_myloneworkers matches NOT_ON_MYLONEWORKERS', () => {
  assert.deepEqual(mine.not_on_myloneworkers, quoted(shared.match(/NOT_ON_MYLONEWORKERS = \[([^\]]*)\]/)[1]));
});

test('portal-properties.json aliases match LEGACY_PROPERTY_NAMES', () => {
  const start = shared.indexOf('LEGACY_PROPERTY_NAMES');
  const block = shared.slice(start, shared.indexOf('};', start));
  const legacy = Object.fromEntries([...block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(mine.aliases, legacy);
});

test('every mapping file points at a real portal property', () => {
  const all = new Set(Object.values(mine.regions).flat());
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site-map.json'), 'utf8'));
  const pm = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'property-map.json'), 'utf8'));
  const targets = [
    ...Object.values(site.sites).flat(),
    ...Object.values(pm.confirmed).flat().map(v => v.property),
    ...Object.values(pm.needs_confirmation).flat().filter(Boolean).map(v => v.property),
  ];
  assert.deepEqual(targets.filter(p => !all.has(p)), []);
});

test('property-map regions match the portal region of each property', () => {
  const regionOf = Object.fromEntries(Object.entries(mine.regions).flatMap(([r, ps]) => ps.map(p => [p, r])));
  const pm = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'property-map.json'), 'utf8'));
  const dests = [...Object.values(pm.confirmed), ...Object.values(pm.needs_confirmation)].flat().filter(Boolean);
  assert.deepEqual(dests.filter(d => regionOf[d.property] !== d.region), []);
});
