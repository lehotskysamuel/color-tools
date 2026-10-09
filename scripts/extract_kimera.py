"""Add the Kimera Kolors Pure Pigments Base Set to data/vallejo.json and
data/vallejo-layouts.json. Other ranges already in those files are kept.

Usage:
    pip install -r scripts/requirements.txt
    python scripts/extract_kimera.py data/sources/kimera-base-set.jpg data
    node scripts/add-oklch.js data/vallejo.json

Kimera Kolors (Kimera Models, sold through Pegaso World, made by Camerini &
Co) are acrylics with one pigment each and no white. The base set has 13
colors and a satin medium, which has no color and is left out. They have no
product codes, so their `code` is null and they are keyed by name. Names and
pigments are the list on the base set's page in the maker's shop
(https://www.pegasoworld.com/product/kimera-kolors-acrylic-set/).

`webhex` (and `rgb`, the same value) comes from the base set's image on that
page (https://www.pegasoworld.com/wp-content/uploads/2022/10/Base-set.jpg,
kept in data/sources/). It shows a flat circle in each paint's color, labeled
with its pigment, in two columns (CIRCLES). The script finds the 14 circles,
the satin medium's among them, and takes the median of a disc inside each
outline. The image has no color profile, so browsers show it as sRGB. The
layout is the order the circles are printed in, as on the box: the image's
left column is the top row.

`cielab` is measured: artistpigments.org painted each paint at full strength
on Hahnemühle Echt Bütten paper and measured it with an X-Rite i1Pro 3 (45/0,
M1, D50 and the 2 degree observer, mean of 3 readings). Its pages sit behind
a bot check, so the values are transcribed (MEASURED). The site licenses its
data CC BY-NC 4.0. It lists the two phthalo blues' pigments the other way
round from the maker; its measurements fit the paints' names (the green
shade is the greener), so they are matched by name.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import vallejo_data

RANGE = "Kimera Kolors"
LAYOUT = "kimeraKolorsBaseSet"

# From the shop's list: name, pigment, and the paint's page on
# artistpigments.org (https://artistpigments.org/brands/kimera-kimera-kolors/...)
# with its CIELAB (D50, 2 degree observer), as published there in June 2026.
MEASURED = [
    ("The White", "PW6", "chzkk-the-white", (96.66, -0.31, 2.82)),
    ("Carbon Black", "PBk7", "svfde-carbon-black", (21.03, -0.24, -0.71)),
    ("The Red", "PR170", "n3ys7-the-red", (45.04, 66.53, 41.25)),
    ("Orange", "PO34", "djzg5-orange", (56.26, 65.90, 59.42)),
    ("Warm Yellow", "PY83", "634o0-warm-yellow", (77.90, 36.86, 90.93)),
    ("Cold Yellow", "PY151", "xc4qh-cold-yellow", (90.92, 0.62, 98.65)),
    ("Phthalo Blue (red shade)", "PB15:2", "jmmh4-phthalo-blue-red-shade", (24.98, 8.04, -36.78)),
    ("Phthalo Blue (green shade)", "PB15:4", "epeg5-phthalo-blue-green-shade", (28.03, 1.74, -39.40)),
    ("Magenta", "PR122", "no3m5-magenta", (37.53, 55.95, 9.62)),
    ("Phthalo Green", "PG7", "wsyhf-phtalo-green", (30.31, -32.28, -0.98)),
    ("Violet", "PV23", "z2yve-violet", (22.26, 8.07, -9.93)),
    ("Red Oxide", "PR101", "q51x7-red-ochre", (38.90, 30.95, 20.24)),
    ("Yellow Oxide", "PY42", "k7o76-yellow-ochre", (69.30, 20.62, 61.42)),
]

# The circles' labels as printed, column by column, and the paint each stands
# for (None: the satin medium). The image labels Red Oxide by its pigment
# grade, PR130.
CIRCLES = [
    [("PW6", "The White"), ("PY151", "Cold Yellow"), ("PY83", "Warm Yellow"), ("SATIN", None),
     ("PY42", "Yellow Oxide"), ("PO34", "Orange"), ("PR170", "The Red")],
    [("PR130", "Red Oxide"), ("PR122", "Magenta"), ("PV23", "Violet"), ("PBK7", "Carbon Black"),
     ("PB15.2", "Phthalo Blue (red shade)"), ("PB15.4", "Phthalo Blue (green shade)"), ("PG7", "Phthalo Green")],
]

# The circles sit in the left third of the image's upper half, on a light
# background. A circle is a blob of pixels this far from the background (in any
# channel), outline included, whose box is between these sizes (in pixels).
SEARCH = (slice(0, 0.5), slice(0, 1 / 3))  # rows, columns, as shares of the image
FROM_BACKGROUND = 40
CIRCLE_SIZE = (40, 60)
# The disc sampled inside each outline, and the largest spread of its 5th to
# 95th percentiles per channel: JPEG noise on a flat fill stays under 8.
SAMPLE_RADIUS = 12
MAX_SPREAD = 10


def find_circles(pixels):
    """Centers (x, y) of the circles, as [[column 1, top to bottom], [column 2, ...]]."""
    height, width = pixels.shape[:2]
    rows = slice(int(SEARCH[0].start * height), int(SEARCH[0].stop * height))
    columns = slice(int(SEARCH[1].start * width), int(SEARCH[1].stop * width))
    region = pixels[rows, columns]
    background = np.median(region.reshape(-1, 3), axis=0)
    labels, _ = ndi.label(np.abs(region - background).max(axis=2) > FROM_BACKGROUND)
    centers = []
    for box in ndi.find_objects(labels):
        h, w = box[0].stop - box[0].start, box[1].stop - box[1].start
        if CIRCLE_SIZE[0] <= h <= CIRCLE_SIZE[1] and CIRCLE_SIZE[0] <= w <= CIRCLE_SIZE[1]:
            centers.append(((box[1].start + box[1].stop) / 2 + columns.start, (box[0].start + box[0].stop) / 2 + rows.start))
    xs = sorted(x for x, _ in centers)
    split = (xs[0] + xs[-1]) / 2
    return [sorted((c for c in centers if (c[0] < split) == left), key=lambda c: c[1]) for left in (True, False)]


def disc_color(pixels, center, where):
    x, y = (round(v) for v in center)
    yy, xx = np.mgrid[-SAMPLE_RADIUS:SAMPLE_RADIUS + 1, -SAMPLE_RADIUS:SAMPLE_RADIUS + 1]
    window = pixels[y - SAMPLE_RADIUS:y + SAMPLE_RADIUS + 1, x - SAMPLE_RADIUS:x + SAMPLE_RADIUS + 1]
    values = window[yy ** 2 + xx ** 2 <= SAMPLE_RADIUS ** 2]
    spread = np.percentile(values, 95, axis=0) - np.percentile(values, 5, axis=0)
    if spread.max() > MAX_SPREAD:
        raise ValueError(f"{where}: the circle is not one flat color (spread {spread})")
    return tuple(int(round(v)) for v in np.median(values, axis=0))


def main(image_path, out_dir):
    pixels = np.asarray(Image.open(image_path).convert("RGB")).astype(int)
    found = find_circles(pixels)
    if [len(c) for c in found] != [len(c) for c in CIRCLES]:
        raise ValueError(f"found {[len(c) for c in found]} circles per column, expected {[len(c) for c in CIRCLES]}")
    web = {}
    for column, labels in zip(found, CIRCLES):
        for center, (label, name) in zip(column, labels):
            color = disc_color(pixels, center, label)
            if name:
                web[name] = "#{:02X}{:02X}{:02X}".format(*color)

    colors = {}
    for name, pigment, _, (L, a, b) in MEASURED:
        colors[name] = {
            "code": None,
            "name": name,
            "range": RANGE,
            "type": "acrylic",
            "pigment": pigment,
            "rgb": web[name],
            "webhex": web[name],
            "cmyk": None,
            "cielab": {"l": L, "a": a, "b": b},
        }

    rows = [[name for _, name in column if name] for column in CIRCLES]
    layout = {
        "title": "Kimera Kolors base set",
        "source": "the Kimera Kolors base set image, without the satin medium",
        "sections": [{"rows": rows}],
    }
    vallejo_data.update(out_dir, {RANGE}, dict(sorted(colors.items())), {LAYOUT: layout})
    print(f"wrote {len(colors)} colors and 1 layout to {out_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
