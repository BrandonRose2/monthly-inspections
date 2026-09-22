/**
 * Month windows in a named time zone, as Unix seconds.
 *
 * MyLoneWorkers shows every timestamp in America/Los_Angeles, and the portal's
 * inspection deadline is the 21st, so a month is split into:
 *
 *   due window   1st 00:00:00  ->  21st 23:59:59   (counts as on time)
 *   late window  22nd 00:00:00 ->  last day 23:59:59 (done, but after the deadline)
 */

// Offset of `timeZone` from UTC at the given instant, in minutes.
function tzOffsetMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - date.getTime()) / 60000;
}

// Unix seconds for a wall-clock time in `timeZone`. Two passes handle a DST
// change between the naive guess and the real instant.
function zonedToEpoch(timeZone, y, m, d, hh = 0, mm = 0, ss = 0) {
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = naive - tzOffsetMinutes(timeZone, new Date(naive)) * 60000;
  guess = naive - tzOffsetMinutes(timeZone, new Date(guess)) * 60000;
  return Math.floor(guess / 1000);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * @param {string} monthKey  "YYYY-MM"
 * @param {object} [opts]
 * @param {string} [opts.timeZone="America/Los_Angeles"]
 * @param {number} [opts.dueDay=21]
 */
function monthWindows(monthKey, { timeZone = 'America/Los_Angeles', dueDay = 21 } = {}) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error(`monthKey must look like YYYY-MM, got "${monthKey}"`);
  const [y, m] = monthKey.split('-').map(Number);
  const last = daysInMonth(y, m);
  const due = Math.min(dueDay, last);
  return {
    monthKey,
    timeZone,
    dueDay: due,
    start: zonedToEpoch(timeZone, y, m, 1),
    dueEnd: zonedToEpoch(timeZone, y, m, due, 23, 59, 59),
    monthEnd: zonedToEpoch(timeZone, y, m, last, 23, 59, 59),
  };
}

function currentMonthKey(timeZone = 'America/Los_Angeles', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const get = t => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}`;
}

function formatLocal(epochSeconds, timeZone = 'America/Los_Angeles') {
  return new Date(epochSeconds * 1000).toLocaleString('en-US', {
    timeZone, month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatLocalDate(epochSeconds, timeZone = 'America/Los_Angeles') {
  return new Date(epochSeconds * 1000).toLocaleDateString('en-US', { timeZone, month: 'numeric', day: 'numeric' });
}

module.exports = { monthWindows, currentMonthKey, zonedToEpoch, formatLocal, formatLocalDate };
