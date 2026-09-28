"""Build data/sources/pigment-spectra.json: measured reflectance spectra of
artist acrylics that each contain one of the Kimera Kolors base set's pigments,
used by extract_kimera.py as stand-ins for the Kimera paints.

Usage:
    pip install -r scripts/requirements.txt
    curl -A "Mozilla/5.0" -O https://www.rit-mcsl.org/StudentResearch/paint_research.zip
    curl -L -o GoldenSpectra.zip \\
        "https://web.archive.org/web/20241216id_/https://www.realtimerendering.com/downloads/GoldenSpectra.zip"
    python scripts/extract_pigment_spectra.py paint_research.zip GoldenSpectra.zip data/sources

Two datasets, both of Golden Artist Colors acrylics, which list their
pigments:

- Y. Okumura, "Developing a spectral and colorimetric database of artist paint
  materials", MS thesis, RIT Munsell Color Science Laboratory, 2005. Golden
  Matte Fluid Acrylics drawn down 10 mil or thicker on Leneta opacity charts,
  thick enough to hide, unvarnished. GretagMacbeth Color-Eye XTH, specular
  excluded (SCE, as a 45/0 instrument sees a matte surface), 360 to 750 nm in
  10 nm steps. The full-strength sample of each tint ladder is used, and for
  Titanium White, which the thesis measured with every ladder, the mean of all
  its readings. Pigments are from the thesis's Table III, which prints Phthalo
  Green (Blue Shade) as PG 17 but describes it as chlorinated copper
  phthalocyanine, which is PG7.
- Golden Heavy Body Acrylics, 10 mil drawdowns over white (2014), as Golden
  gave them to realtimerendering.com: 400 to 700 nm in 10 nm steps. Golden
  notes that the white card shows through the more transparent colors, so
  these films do not quite hide. Used for the two pigments the thesis lacks.
  Pigments are as Golden lists them today.
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
import openpyxl

OUT_FILE = "pigment-spectra.json"

OKUMURA_FILE = "paint_research/Measurement Data/Reflectance/raw (XTH)/GOLDEN_fluid_matte_all_sce.txt"
OKUMURA_NM = (360, 750, 10)
OKUMURA = "Okumura 2005 (RIT MCSL): Golden Matte Fluid, full strength, unvarnished, SCE"
OKUMURA_PAINTS = [
    # sample name in the file, paint, pigment
    ("TiO2", "Golden Matte Fluid Titanium White", "PW6"),
    ("CarbonBlack_100", "Golden Matte Fluid Carbon Black", "PBk7"),
    ("DioxazinePurple_100", "Golden Matte Fluid Dioxazine Purple", "PV23"),
    ("PhthaloGreenBShade_100", "Golden Matte Fluid Phthalo Green (Blue Shade)", "PG7"),
    ("PhthaloBlueGShade_100", "Golden Matte Fluid Phthalo Blue (Green Shade)", "PB15:4"),
    ("QuinacridoneMagenta_100", "Golden Matte Fluid Quinacridone Magenta", "PR122"),
    ("RedOxide_100", "Golden Matte Fluid Red Oxide", "PR101"),
    ("DiarylideYellow_100", "Golden Matte Fluid Diarylide Yellow", "PY83"),
]

GOLDEN_FILE = "Reflectance Data for Golden HB 10 mil Drawdowns over White.xlsx"
GOLDEN = "Golden 2014: Golden Heavy Body, 10 mil drawdown over white"
GOLDEN_PAINTS = [
    # product number, paint, pigment
    (1410, "Golden Heavy Body Yellow Oxide", "PY42"),
    (1260, "Golden Heavy Body Phthalo Blue (Red Shade)", "PB15:0"),
]


def read_xth(text):
    """{sample name: [spectra]} from a ProPalette export: a name line, the
    number of values, then the values, comma separated over several lines."""
    lines = text.split("\n")
    samples, i = {}, 3
    while i < len(lines):
        if re.match(r"^[A-Za-z]", lines[i]) and i + 1 < len(lines) and lines[i + 1].strip().isdigit():
            count = int(lines[i + 1])
            values, j = [], i + 2
            while len(values) < count:
                values += [float(v) for v in lines[j].split(",") if v.strip()]
                j += 1
            samples.setdefault(lines[i].strip(), []).append(values)
            i = j
        else:
            i += 1
    return samples


def okumura(path):
    with zipfile.ZipFile(path) as z:
        samples = read_xth(z.read(OKUMURA_FILE).decode("latin-1"))
    spectra = {}
    for sample, paint, pigment in OKUMURA_PAINTS:
        readings = samples[sample]
        if len(readings) > 1 and sample != "TiO2":
            raise ValueError(f"{sample}: {len(readings)} readings")
        spectra[paint] = {
            "pigment": pigment,
            "dataset": OKUMURA + (f", mean of {len(readings)} readings" if len(readings) > 1 else ""),
            "nm": list(OKUMURA_NM),
            "reflectance": [round(v, 2) for v in np.mean(readings, axis=0)],
        }
    return spectra


def golden(path):
    with zipfile.ZipFile(path) as z:
        sheet = openpyxl.load_workbook(io.BytesIO(z.read(GOLDEN_FILE)), data_only=True).worksheets[0]
    rows = list(sheet.iter_rows(values_only=True))
    header = rows[1]
    first, last = header.index(400), header.index(700)
    by_number = {row[0]: row for row in rows[2:] if isinstance(row[0], int)}
    spectra = {}
    for number, paint, pigment in GOLDEN_PAINTS:
        row = by_number[number]
        spectra[paint] = {
            "pigment": pigment,
            "dataset": f"{GOLDEN}, product {number}",
            "nm": [400, 700, 10],
            "reflectance": [round(float(v), 2) for v in row[first:last + 1]],
        }
    return spectra


def main(okumura_zip, golden_zip, out_dir):
    spectra = {**okumura(okumura_zip), **golden(golden_zip)}
    lines = [f"  {json.dumps(paint)}: {json.dumps(s)}" for paint, s in spectra.items()]
    path = Path(out_dir) / OUT_FILE
    path.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print(f"wrote {len(spectra)} spectra to {path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
