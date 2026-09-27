import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHex, rgbToOklch } from '../src/color.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );

describe('parseHex', () => {
  it('parses 6-digit hex with or without #', () => {
    assert.deepEqual(parseHex('#1A2b3C'), { r: 26, g: 43, b: 60 });
    assert.deepEqual(parseHex('ff8000'), { r: 255, g: 128, b: 0 });
  });

  it('expands 3-digit hex', () => {
    assert.deepEqual(parseHex('#f80'), { r: 255, g: 136, b: 0 });
  });

  it('rejects invalid input', () => {
    assert.throws(() => parseHex('#12345'), TypeError);
    assert.throws(() => parseHex('#gggggg'), TypeError);
  });
});

describe('rgbToOklch', () => {
  // Reference values from CSS Color 4 / culori.
  const cases = [
    ['#FF0000', 0.627955, 0.257683, 29.2339],
    ['#00FF00', 0.86644, 0.294827, 142.4953],
    ['#0000FF', 0.452014, 0.313214, 264.052],
    ['#FFFF00', 0.967983, 0.211006, 109.7692],
    ['#663399', 0.440272, 0.160296, 303.373],
  ];
  for (const [hex, l, c, h] of cases) {
    it(`converts ${hex}`, () => {
      const out = rgbToOklch(hex);
      close(out.l, l, 1e-5, 'l');
      close(out.c, c, 1e-5, 'c');
      close(out.h, h, 1e-3, 'h');
    });
  }

  it('returns null hue for achromatic colors', () => {
    for (const hex of ['#FFFFFF', '#808080', '#000000']) {
      const out = rgbToOklch(hex);
      assert.equal(out.h, null, hex);
      close(out.c, 0, 1e-6, `${hex} c`);
    }
    close(rgbToOklch('#FFFFFF').l, 1, 1e-6, 'white l');
    close(rgbToOklch('#000000').l, 0, 1e-12, 'black l');
  });

  it('accepts channel objects', () => {
    assert.deepEqual(rgbToOklch({ r: 255, g: 0, b: 0 }), rgbToOklch('#FF0000'));
  });
});
