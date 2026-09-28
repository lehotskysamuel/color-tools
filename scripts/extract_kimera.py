"""Build data/kimera.json: the Kimera Kolors Pure Pigments Base Set.

Usage:
    pip install -r scripts/requirements.txt
    curl -A "Mozilla/5.0" -o kolors-charts.pdf \\
        https://www.pegasoworld.com/wp-content/uploads/2026/05/kolors-charts.pdf
    python scripts/extract_kimera.py kolors-charts.pdf data
    node scripts/add-oklch.js data/kimera.json

Kimera Kolors (Kimera Models, sold through Pegaso World, made by Camerini &
Co) are acrylics with one pigment each and no white. The base set has 13
colors and a satin medium, which has no color and is left out. They have no
product codes, so the file is keyed by name. Names and pigments are the list
on the base set's page in the maker's shop (BASE_SET). The chart prints two
of the pigments differently, and wrongly: Warm Yellow as PY85 (the shop names
it Diarylide Yellow HR, which is PY83) and Red Oxide as PR130 (the shop:
"PR101 (130)").

The maker's shop gives no color value as text or CSS. Its product photos show
the paint through the translucent bottle, lighter and bluer than the chart
shows it, so they are not used. The maker's color chart ("Kimera Kolors
Charts", on its resources page) shows scans of hand-painted swatches: a
square that goes from the paint at full strength at the top to a thin wash at
the bottom, with a black line under it to show how well it covers, and strips
mixed with white below. `webhex` is the full-strength top of the square: the
median of a band just below its top edge, right of the black line, in the
chart's own CMYK, converted for display through the chart's profile (U.S.
Sheetfed Uncoated v2), relative colorimetric with black point compensation.
That is how Vallejo's web colors are made from its chart. `rgb` holds the same
value.

The White is white paint on white paper, so its square cannot be told from
the paper. Its band is taken at the offset where the others' squares start,
and holds the paper's color.
"""
import io
import sys
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image
from pdfminer.pdftypes import resolve1

import vallejo_data
from lcms import CmykToSrgb

RANGE = "Kimera Kolors"
OUT_FILE = "kimera.json"

# From https://www.pegasoworld.com/product/kimera-kolors-acrylic-set/, with the
# chart's label for each color.
BASE_SET = [
    # name, pigment, chart label
    ("The White", "PW6", "The White"),
    ("Carbon Black", "PBk7", "Carbon Black"),
    ("The Red", "PR170", "The Red"),
    ("Orange", "PO34", "Orange"),
    ("Warm Yellow", "PY83", "Warm Yellow"),
    ("Cold Yellow", "PY151", "Cold yellow"),
    ("Phthalo Blue (red shade)", "PB15:2", "Phthalo Blue Red S."),
    ("Phthalo Blue (green shade)", "PB15:4", "Phthalo Blue Green S."),
    ("Magenta", "PR122", "Magenta"),
    ("Phthalo Green", "PG7", "Phthalo Green"),
    ("Violet", "PV23", "Violet"),
    ("Red Oxide", "PR101", "Red Oxide"),
    ("Yellow Oxide", "PY42", "Yellow Oxide"),
]

# A swatch's label is printed just above its scan.
LABEL_GAP = 25  # points
# The band sampled for the full-strength color, in scan pixels: rows below the
# square's top edge, columns as a share of the width (the black line is left
# of them).
BAND_ROWS = (8, 40)
BAND_COLUMNS = (0.3, 0.85)
# A row belongs to the square when its ink, summed over C, M, Y and K, exceeds
# the paper's by this much (percent). Squares start in the top fifth of the scan.
SQUARE_INK = 16
SQUARE_SEARCH = 0.2
# Where the squares start, for The White.
PAPER_WHITE = {"The White"}


def output_intent_profile(pdf):
    intent = resolve1(resolve1(pdf.doc.catalog["OutputIntents"])[0])
    return resolve1(intent["DestOutputProfile"]).get_data()


def swatch_scans(page):
    """{chart label: CMYK scan as a float array of ink percentages}. The chart's
    "How to read the chart" box repeats The Red below the swatches, so the
    first swatch with a label, in reading order, is kept."""
    words = page.extract_words()
    scans = {}
    for image in sorted(page.images, key=lambda i: (round(i["top"]), i["x0"])):
        above = [
            w for w in words
            if image["top"] - LABEL_GAP < w["bottom"] <= image["top"] + 1
            and image["x0"] - 5 <= (w["x0"] + w["x1"]) / 2 <= image["x1"] + 5
        ]
        if not above:
            continue
        name_line = min(round(w["top"]) for w in above)
        label = " ".join(w["text"] for w in sorted(above, key=lambda w: w["x0"]) if round(w["top"]) == name_line)
        if label in scans:
            continue
        # Adobe CMYK JPEGs store the ink inverted.
        pixels = np.asarray(Image.open(io.BytesIO(image["stream"].get_rawdata())))
        scans[label] = (255 - pixels.astype(float)) / 255 * 100
    return scans


def square_top(ink):
    columns = ink[:, slice(*(int(ink.shape[1] * f) for f in BAND_COLUMNS))].sum(axis=2).mean(axis=1)
    paper = np.median(columns[:8])
    for y in range(8, int(len(columns) * SQUARE_SEARCH)):
        if (columns[y:y + 5] > paper + SQUARE_INK).all():
            return y
    return None


def full_strength(ink, top):
    rows = slice(top + BAND_ROWS[0], top + BAND_ROWS[1])
    columns = slice(*(int(ink.shape[1] * f) for f in BAND_COLUMNS))
    return np.median(ink[rows, columns].reshape(-1, 4), axis=0)


def main(chart_pdf, out_dir):
    pdf = pdfplumber.open(chart_pdf)
    to_srgb = CmykToSrgb(output_intent_profile(pdf))
    scans = swatch_scans(pdf.pages[0])

    tops = {}
    for name, _, label in BASE_SET:
        if label not in scans:
            raise ValueError(f"no swatch labeled {label!r} on the chart")
        tops[name] = square_top(scans[label])
        if (tops[name] is None) != (name in PAPER_WHITE):
            raise ValueError(f"{name}: square top {tops[name]}")
    usual_top = int(np.median([t for t in tops.values() if t is not None]))

    colors = {}
    for name, pigment, label in BASE_SET:
        cmyk = full_strength(scans[label], tops[name] if tops[name] is not None else usual_top)
        hex_color = "#{:02X}{:02X}{:02X}".format(*to_srgb(cmyk))
        colors[name] = {
            "name": name,
            "range": RANGE,
            "type": "acrylic",
            "pigment": pigment,
            "rgb": hex_color,
            "webhex": hex_color,
            "cmyk": None,
            "cielab": None,
        }

    path = Path(out_dir) / OUT_FILE
    path.write_text(vallejo_data.format_colors(colors), encoding="utf-8")
    print(f"wrote {len(colors)} colors to {path}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
