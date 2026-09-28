"""Build data/kimera.json: the Kimera Kolors Pure Pigments Base Set.

Usage:
    pip install -r scripts/requirements.txt
    curl -A "Mozilla/5.0" -o kolors-charts.pdf \\
        https://www.pegasoworld.com/wp-content/uploads/2026/05/kolors-charts.pdf
    python scripts/extract_kimera.py kolors-charts.pdf data
    node scripts/add-oklch.js data/kimera.json

It reads data/sources/pigment-spectra.json (see extract_pigment_spectra.py).

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

No measurement of the Kimera paints themselves was found. A pigment has no
single color: grade, particle size, binder, pigment load and film thickness
all change it. So `cielab` is a stand-in: the measured full-strength film
of a Golden acrylic with the same pigment (for PB15:2, the nearest one,
PB15:0), drawn down thick enough to hide or nearly (STAND_INS), computed from
its spectrum for illuminant D50 and the 2 degree observer (ASTM E308).
`cielabSource` names it. Three pigments have no usable measurement (PR170,
PO34, PY151), so their `cielab` is null. Transparent pigments are nearly
black as a film that hides; a thin layer over a light primer looks much
lighter and more colorful than their `cielab` says.
"""
import io
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image
from pdfminer.pdftypes import resolve1

with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # colour-science warns that matplotlib is missing
    import colour
# ASTM E308 at 10 nm works with each spectrum's own range; colour-science
# reports that on every call.
colour.utilities.filter_warnings(colour_runtime_warnings=True)

import vallejo_data
from lcms import CmykToSrgb

RANGE = "Kimera Kolors"
OUT_FILE = "kimera.json"
SPECTRA_FILE = "sources/pigment-spectra.json"

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

# The paint in SPECTRA_FILE that stands in for each pigment. Golden's Phthalo
# Blue (Red Shade) is PB15:0: the same red-shade (alpha) copper phthalocyanine
# as PB15:2, without the treatment that keeps PB15:2 from recrystallizing and
# flocculating. The others have the same pigment.
STAND_INS = {
    "PW6": "Golden Matte Fluid Titanium White",
    "PBk7": "Golden Matte Fluid Carbon Black",
    "PV23": "Golden Matte Fluid Dioxazine Purple",
    "PG7": "Golden Matte Fluid Phthalo Green (Blue Shade)",
    "PB15:4": "Golden Matte Fluid Phthalo Blue (Green Shade)",
    "PB15:2": "Golden Heavy Body Phthalo Blue (Red Shade)",
    "PR122": "Golden Matte Fluid Quinacridone Magenta",
    "PR101": "Golden Matte Fluid Red Oxide",
    "PY83": "Golden Matte Fluid Diarylide Yellow",
    "PY42": "Golden Heavy Body Yellow Oxide",
}

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
# White on white paper: no square to find, so the band is taken where the
# other squares start.
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


def spectrum_to_cielab(spectrum):
    """CIELAB (D50, 2 degree observer) of a reflectance spectrum in percent,
    through ASTM E308 weights, relative to the same integration of a perfect
    white."""
    start, end, step = spectrum["nm"]
    nm = range(start, end + 1, step)
    cmfs = colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"]
    d50 = colour.SDS_ILLUMINANTS["D50"]

    def xyz(values):
        return colour.sd_to_XYZ(colour.SpectralDistribution(dict(zip(nm, values))), cmfs, d50, method="ASTM E308")

    white = xyz(np.ones(len(nm)))
    L, a, b = colour.XYZ_to_Lab(xyz(np.array(spectrum["reflectance"]) / 100) / 100, colour.XYZ_to_xy(white / 100))
    return {"l": round(float(L), 2), "a": round(float(a), 2), "b": round(float(b), 2)}


def cielab_source(paint, spectrum):
    return f"{paint} ({spectrum['pigment']}); {spectrum['dataset'].split(':')[0]}"


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

    spectra = json.loads((Path(out_dir) / SPECTRA_FILE).read_text(encoding="utf-8"))

    colors = {}
    for name, pigment, label in BASE_SET:
        cmyk = full_strength(scans[label], tops[name] if tops[name] is not None else usual_top)
        hex_color = "#{:02X}{:02X}{:02X}".format(*to_srgb(cmyk))
        stand_in = STAND_INS.get(pigment)
        colors[name] = {
            "name": name,
            "range": RANGE,
            "type": "acrylic",
            "pigment": pigment,
            "rgb": hex_color,
            "webhex": hex_color,
            "cmyk": None,
            "cielab": spectrum_to_cielab(spectra[stand_in]) if stand_in else None,
            "cielabSource": cielab_source(stand_in, spectra[stand_in]) if stand_in else None,
        }

    path = Path(out_dir) / OUT_FILE
    path.write_text(vallejo_data.format_colors(colors), encoding="utf-8")
    print(f"wrote {len(colors)} colors to {path}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
