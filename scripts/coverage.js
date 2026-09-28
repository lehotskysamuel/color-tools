// How much of Pointer's gamut and of sRGB a set of colors covers: the share of each gamut's volume in OKLab
// that lies inside the convex hull of the colors (see src/color/coverage.ts).
// Usage: node scripts/coverage.js data/vallejo.json   (Node 22.18+, which runs the .ts imports)
//
// The file is a code-keyed object like data/vallejo.json, or an array. Each color is a "#rrggbb" string or an
// object with an `rgb` hex and optionally `cielab` (D50), which is used when present, as on the page
// (src/paints/record.ts). When colors have `range` or `type` fields, each group is reported too, and for a field
// with more than two values, everything except each group.
import { readFileSync } from 'node:fs';
import { colorSetCoverage, srgbShareOfPointer } from '../src/color/coverage.ts';
import { recordOklab } from '../src/paints/record.ts';

const GROUP_FIELDS = ['range', 'type'];

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/coverage.js <colors.json>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, 'utf8'));
const colors = (Array.isArray(raw) ? raw : Object.values(raw)).map((c) => {
  const color = typeof c === 'string' ? { rgb: c } : c;
  return { ...color, lab: recordOklab(color) };
});

const sets = [['all', colors]];
for (const field of GROUP_FIELDS) {
  const values = [...new Set(colors.map((c) => c[field]).filter((v) => v !== undefined))];
  if (values.length < 2) continue;
  for (const v of values) sets.push([`${field} ${v}`, colors.filter((c) => c[field] === v)]);
  // With two values, "all but one" is just the other one.
  if (values.length > 2) for (const v of values) sets.push([`all but ${field} ${v}`, colors.filter((c) => c[field] !== v)]);
}

const pct = (share) => (share === null ? 'no volume' : `${(share * 100).toFixed(1)} %`);
const rows = [
  ['Colors', 'n', "Pointer's", 'sRGB'],
  ...sets.map(([name, set]) => {
    const labs = set.map((c) => c.lab);
    return [name, String(set.length), pct(colorSetCoverage(labs, 'pointer')), pct(colorSetCoverage(labs, 'srgb'))];
  }),
  ['sRGB itself', '', pct(srgbShareOfPointer()), pct(1)],
];

const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
const fromLab = colors.filter((c) => c.cielab).length;
console.log("Share of each gamut's volume in OKLab inside the convex hull of the colors.");
console.log(`Colors from cielab: ${fromLab}, from rgb: ${colors.length - fromLab}.\n`);
for (const row of rows) console.log(row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('   '));
