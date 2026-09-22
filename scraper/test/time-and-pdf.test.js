const test = require('node:test');
const assert = require('node:assert/strict');
const { monthWindows, zonedToEpoch } = require('../lib/time');
const { eventsQuery } = require('../lib/mlw-api');
const { buildReportPdf } = require('../lib/report-pdf');

test('month windows are in Los Angeles time and split at the 21st', () => {
  const w = monthWindows('2026-09');
  assert.equal(new Date(w.start * 1000).toISOString(), '2026-09-01T07:00:00.000Z');
  assert.equal(new Date(w.dueEnd * 1000).toISOString(), '2026-09-22T06:59:59.000Z');
  assert.equal(new Date(w.monthEnd * 1000).toISOString(), '2026-10-01T06:59:59.000Z');
});

test('DST is handled (November starts in PDT, ends in PST)', () => {
  const w = monthWindows('2026-11');
  assert.equal(new Date(w.start * 1000).toISOString(), '2026-11-01T07:00:00.000Z');
  assert.equal(new Date(w.monthEnd * 1000).toISOString(), '2026-12-01T07:59:59.000Z');
  assert.equal(zonedToEpoch('America/Los_Angeles', 2026, 1, 1), Date.UTC(2026, 0, 1, 8) / 1000);
});

test('events query never filters to mobile-form-only scans', () => {
  const q = eventsQuery({ guardIds: ['x'], from: 1, to: 2 });
  assert.equal(q.MOBILEFORMS, false);
  assert.equal(q.GEOFENCE, false);
  assert.equal(q.SCAN, true);
});

test('PDF report renders', async () => {
  const w = monthWindows('2026-09');
  const buf = await buildReportPdf({
    monthLabel: 'September 2026', windows: w,
    result: { region: 'Region 2', property: 'Breckenridge', status: 'pass', note: '8 units scanned 9/17 by Grace Townhomes Manager.',
      units: 8, onTimeUnits: 8, inspectors: ['Grace Townhomes Manager'],
      scans: [{ scanTimestamp: w.start + 3600, checkpoint: { ID: 1, name: 'Unit 55-2104' }, guard_details: 'Grace Townhomes Manager (0160920077)', patrolID: 10 }] },
  });
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
  assert.ok(buf.length > 1000);
});
