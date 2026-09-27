// Add `oklch` to every color in a code-keyed JSON file, computed from its `rgb` hex.
// Usage: node scripts/add-oklch.js data/vallejo.json   (Node 22.18+, which runs the .ts import)
import { readFileSync, writeFileSync } from 'node:fs';
import { hexToOklch } from '../src/color/oklab.ts';

// Hue is undefined for neutrals; store null below the chroma formatOklch also treats as neutral.
const ACHROMATIC_CHROMA = 1e-4;

const round = (value, digits) => Number(value.toFixed(digits));

// Same layout the extractor writes: one color per line, `"key": value` spacing.
const inline = (value) =>
  value !== null && typeof value === 'object'
    ? `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')}}`
    : JSON.stringify(value);

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/add-oklch.js <file.json>');
  process.exit(1);
}

const colors = JSON.parse(readFileSync(path, 'utf8'));
const lines = Object.entries(colors).map(([code, color]) => {
  const [l, c, h] = hexToOklch(color.rgb);
  const hue = c < ACHROMATIC_CHROMA ? null : round(h, 2);
  const withOklch = { ...color, oklch: { l: round(l, 4), c: round(c, 4), h: hue } };
  return `  ${JSON.stringify(code)}: ${inline(withOklch)}`;
});

writeFileSync(path, `{\n${lines.join(',\n')}\n}\n`);
console.log(`Added oklch to ${lines.length} colors in ${path}`);
