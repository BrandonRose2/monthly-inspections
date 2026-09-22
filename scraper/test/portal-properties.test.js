const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('portal-properties.json matches REGIONS in the portal UI', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'Home.tsx'), 'utf8');
  const ui = {};
  for (const m of home.matchAll(/\{\s*name:\s*"([^"]+)",\s*properties:\s*\[([^\]]*)\]\s*\}/g)) {
    ui[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  }
  assert.ok(Object.keys(ui).length >= 4, 'could not parse REGIONS from Home.tsx');
  const mine = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'portal-properties.json'), 'utf8')).regions;
  assert.deepEqual(mine, ui);
});
