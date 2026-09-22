/**
 * Events modelled on real September 2026 MyLoneWorkers data (shapes copied
 * from the live API; unit lists shortened where the count is what matters).
 */
const { zonedToEpoch } = require('../lib/time');

const TZ = 'America/Los_Angeles';
let nextId = 1;
const at = (d, hh, mm) => zonedToEpoch(TZ, 2026, 9, d, hh, mm);

function ev({ day, hh = 7, mm = 0, type = 'SCAN', guard, client = null, unit = null, tour = 1 }) {
  const id = nextId++;
  return {
    ID: id,
    snapshot: type,
    scanTimestamp: at(day, hh, mm),
    guard_details: guard,
    patrolID: tour,
    checkpoint: client
      ? { ID: 10000 + (unit ?? id), name: `Unit ${unit ?? id}`, client, site: null }
      : { ID: null, name: null, client: null, site: null },
  };
}

const GRACE = 'Grace Townhomes Manager (0160920077)';
const STAR = 'Star Homes Manager (0560910076)';
const LEX = 'Lexington Manager (0860920072)';
const GROVE = 'Grove Park Terrace Manager (0260920076)';
const RIVER = 'River Point Manager (0060920079)';

function septemberEvents() {
  nextId = 1;
  const e = [];
  // Grace Townhomes login: 7 units at Grace on 9/15, then Breckenridge on 9/17.
  e.push(ev({ day: 15, hh: 6, mm: 35, type: 'START', guard: GRACE, tour: 10 }));
  for (let i = 0; i < 7; i++) e.push(ev({ day: 15, mm: i, guard: GRACE, client: 'Grace Townhomes - Grace Townhomes', unit: 1600 + i, tour: 10 }));
  e.push(ev({ day: 17, hh: 6, mm: 45, guard: GRACE, client: 'Lexington Arms - Lexington Arms', unit: 2102, tour: 10 }));
  for (let i = 0; i < 8; i++) e.push(ev({ day: 17, mm: 10 + i, guard: GRACE, client: 'Breckenridge Village - Breckenridge Village', unit: 2200 + i, tour: 10 }));

  // Star Homes login only scanned units at Marrero 3 and Ruby Diamond.
  e.push(ev({ day: 3, hh: 13, mm: 28, type: 'START', guard: STAR, tour: 9 }));
  e.push(ev({ day: 3, hh: 13, mm: 29, guard: STAR, client: 'Ruby Diamond - Ruby Diamond', unit: 7228, tour: 9 }));
  e.push(ev({ day: 3, hh: 13, mm: 47, guard: STAR, client: 'Marrero 3 - Marrero 3', unit: 6820, tour: 9 }));
  e.push(ev({ day: 3, hh: 14, mm: 2, type: 'FINISH', guard: STAR, tour: 9 }));

  // Lexington did its full inspection a day late, on 9/22.
  e.push(ev({ day: 22, hh: 7, mm: 5, type: 'START', guard: LEX, tour: 18 }));
  for (let i = 0; i < 8; i++) e.push(ev({ day: 22, mm: 6 + i * 4, guard: LEX, client: 'Lexington Arms - Lexington Arms', unit: 400 + i, tour: 18 }));
  e.push(ev({ day: 22, hh: 7, mm: 47, type: 'FINISH', guard: LEX, tour: 18 }));

  // Grove Park Terrace: a FINISH with no unit scans at all.
  e.push(ev({ day: 22, hh: 6, mm: 58, type: 'FINISH', guard: GROVE, tour: 11 }));

  // River Pointe: a normal on-time inspection.
  e.push(ev({ day: 21, hh: 9, type: 'START', guard: RIVER, tour: 126 }));
  for (let i = 0; i < 12; i++) e.push(ev({ day: 21, hh: 9, mm: 1 + i, guard: RIVER, client: 'River Point Apts - River Point Apts', unit: 100 + i, tour: 126 }));
  e.push(ev({ day: 21, hh: 9, mm: 30, type: 'FINISH', guard: RIVER, tour: 126 }));

  // A site nobody has mapped yet.
  e.push(ev({ day: 12, guard: RIVER, client: 'Brand New Place - Brand New Place', unit: 9, tour: 127 }));

  return e.sort((a, b) => a.scanTimestamp - b.scanTimestamp);
}

module.exports = { septemberEvents, TZ };
