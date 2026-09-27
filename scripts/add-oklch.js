// Add `oklch` to every color in a JSON file, computed from its `rgb` hex.
// Usage: node scripts/add-oklch.js data/vallejo.json
import { readFileSync, writeFileSync } from 'node:fs';
import { rgbToOklch } from '../src/color.js';

const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/add-oklch.js <file.json>');
  process.exit(1);
}

const colors = JSON.parse(readFileSync(path, 'utf8')).map((color) => {
  const { l, c, h } = rgbToOklch(color.rgb);
  return { ...color, oklch: { l: round(l, 4), c: round(c, 4), h: round(h, 2) } };
});

writeFileSync(path, `${JSON.stringify(colors, null, 2)}\n`);
console.log(`Added oklch to ${colors.length} colors in ${path}`);
