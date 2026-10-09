/**
 * Which field of a paint record gives its color, shared by the page and the scripts: `webhex`, the sRGB color the
 * maker shows for the paint on its website.
 *
 * It is not the most accurate field. `cielab` holds the chart's print color without sRGB's limit, and for Kimera
 * Kolors a measurement of dried paint. But only some ranges have `cielab`, and figures from different kinds of
 * source are not comparable. Every range has a web color, made for screens the same way: clipped to sRGB, with
 * the darkest color shown as black. So every set carries the same kind of error.
 */
import { type Vec3, hexToLinear, linearSrgbToOklab } from '../color/oklab.ts';

export interface ColorRecord {
  webhex: string;
}

/** The record's color in OKLab. */
export function recordOklab(record: ColorRecord): Vec3 {
  return linearSrgbToOklab(hexToLinear(record.webhex));
}
