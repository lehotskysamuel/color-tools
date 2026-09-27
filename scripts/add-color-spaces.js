// Add `oklch` and `cmyk` to every color in a JSON file, computed from its `rgb` hex.
// Usage: node scripts/add-color-spaces.js data/vallejo.json
import { readFileSync, writeFileSync } from 'node:fs';
import { rgbToCmyk, rgbToOklch } from '../src/color.js';

const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/add-color-spaces.js <file.json>');
  process.exit(1);
}

const colors = JSON.parse(readFileSync(path, 'utf8')).map((color) => {
  const oklch = rgbToOklch(color.rgb);
  const cmyk = rgbToCmyk(color.rgb);
  return {
    ...color,
    oklch: { l: round(oklch.l, 4), c: round(oklch.c, 4), h: round(oklch.h, 2) },
    cmyk: {
      c: round(cmyk.c, 1),
      m: round(cmyk.m, 1),
      y: round(cmyk.y, 1),
      k: round(cmyk.k, 1),
    },
  };
});

writeFileSync(path, `${JSON.stringify(colors, null, 2)}\n`);
console.log(`Added oklch and cmyk to ${colors.length} colors in ${path}`);
