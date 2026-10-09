"""Build the Game Color and Model Color entries of data/vallejo.json and
data/vallejo-layouts.json from Vallejo's charts. Other ranges already in those
files (Squidmar Color) are kept.

Usage:
    pip install -r scripts/requirements.txt
    curl -A "Mozilla/5.0" -o game.pdf  https://acrylicosvallejo.com/wp-content/uploads/2025/09/CC266-Game_Color.pdf
    curl -A "Mozilla/5.0" -o model.pdf https://acrylicosvallejo.com/wp-content/uploads/2024/03/CC329-R00-Model-Color-NewIC.pdf
    python scripts/extract_vallejo.py game.pdf model.pdf data
    node scripts/add-oklch.js data/vallejo.json

Every swatch in the color charts is a filled rectangle with its code label
directly below it, followed by a running index number and the name (Model
Color also prints a Spanish name on a second line). Fills are print values:
DeviceCMYK, or /Separation spot colors whose alternate space is DeviceCMYK.
Each color is stored three ways, all from the chart's own output intent ICC
profile (Coated FOGRA39):

- `cmyk`: the print CMYK itself, in percent.
- `cielab`: CIELAB (D50), relative colorimetric (paper white = L* 100), without
  black point compensation, in double precision through LittleCMS
  (scripts/lcms.py). It is not limited to sRGB, so the page uses it.
- `rgb`: sRGB hex, relative colorimetric with black point compensation, the
  Adobe default for displaying CMYK documents. Colors outside sRGB end up on
  its edge.

The charts also print Highlight / Base / Shadow combination tables; they are
not extracted.
"""
import io
import re
import sys

import pdfplumber
from PIL import Image, ImageCms
from pdfminer.pdfcolor import PDFColorSpace
from pdfminer.pdfinterp import PDFPageInterpreter
from pdfminer.pdftypes import resolve1
from pdfminer.psparser import literal_name

import vallejo_data
from lcms import CmykToLab

CODE_RE = re.compile(r"^\d{2}\.\d{3}$")

# Chart index ranges (the small number printed next to each code), the paint
# type, and the chart heading the swatches sit under. Sections without a
# heading are left out: metallics, and Special FX, whose swatches are photo
# textures without a single flat color.
GAME_SECTIONS = [
    (1, 79, "acrylic", "Game Color Chart"),
    (81, 88, "wash", "Game Color Wash"),
    (89, 100, "special-fx", None),
    (101, 108, "fluorescent", "Game Color Fluo"),
    (109, 120, "ink", "Game Color Ink"),
    (121, 129, "metallic", None),
]
MODEL_SECTIONS = [
    (1, 192, "acrylic", "Model Color Chart"),
    (193, 194, "ink", "Model Color Chart"),
    (195, 204, "metallic", None),
]
EXPECTED_COUNTS = {
    "Game Color": {"acrylic": 80, "wash": 8, "fluorescent": 8, "ink": 12},
    "Model Color": {"acrylic": 192, "ink": 2},
}

SOURCES = {
    "Game Color": "CC266 Game Color & Xpress Color, Rev. 03 (September 2025)",
    "Model Color": "CC329 Model Color, Rev. 00 (March 2024)",
}

# Words the charts truncate to fit the label width.
ABBREVIATIONS = {
    "Cam.": "Camouflage",
    "Ger.": "German",
    "Germ.": "German",
    "Unif.": "Uniform",
    "Japan.": "Japanese",
    "Med.": "Medium",
    "Fluoresc.": "Fluorescent",
    "Fluo.": "Fluorescent",
}

# pdfminer collapses every /Separation color space into one shared object and
# drops the resource name, so spot-colored swatches would lose their CMYK.
# Give each named color space its own object and tag scn colors with it.
_orig_init_resources = PDFPageInterpreter.init_resources
_orig_do_scn = PDFPageInterpreter.do_scn


def _init_resources(self, resources):
    _orig_init_resources(self, resources)
    for key, cs in list(self.csmap.items()):
        if cs.name in ("Separation", "DeviceN", "Indexed", "ICCBased"):
            self.csmap[key] = PDFColorSpace(f"{cs.name}|{key}", cs.ncomponents)


def _do_scn(self):
    _orig_do_scn(self)
    name = self.graphicstate.ncs.name
    if "|" in name:
        color = self.graphicstate.ncolor
        components = tuple(color) if isinstance(color, (list, tuple)) else (color,)
        self.graphicstate.ncolor = (name,) + components


PDFPageInterpreter.init_resources = _init_resources
PDFPageInterpreter.do_scn = _do_scn
PDFPageInterpreter.do_sc = _do_scn


def separations(page):
    """Map color space resource name -> (C0, C1) CMYK endpoints."""
    spaces = resolve1(resolve1(page.page_obj.resources).get("ColorSpace", {}))
    out = {}
    for key, spec in spaces.items():
        spec = resolve1(spec)
        if not (isinstance(spec, list) and literal_name(spec[0]) == "Separation"):
            continue
        if literal_name(spec[2]) != "DeviceCMYK":
            continue
        fn = resolve1(spec[3])
        if fn.get("FunctionType") != 2 or float(fn.get("N", 1)) != 1:
            raise ValueError(f"unsupported tint transform in {key}: {fn}")
        out[key] = (fn.get("C0", [0, 0, 0, 0]), fn["C1"])
    return out


def fill_to_cmyk(color, seps):
    if isinstance(color, tuple) and color and isinstance(color[0], str):
        c0, c1 = seps[color[0].split("|")[1]]
        tint = color[1]
        return [a + tint * (b - a) for a, b in zip(c0, c1)]
    if isinstance(color, (tuple, list)) and len(color) == 4:
        return [float(v) for v in color]
    raise ValueError(f"unexpected fill color {color!r}")


def output_intent_profile(pdf):
    intent = resolve1(resolve1(pdf.doc.catalog["OutputIntents"])[0])
    return resolve1(intent["DestOutputProfile"]).get_data()


def expand(name):
    return " ".join(ABBREVIATIONS.get(word, word) for word in name.split())


def section(index, sections):
    for lo, hi, kind, heading in sections:
        if lo <= index <= hi:
            return kind, heading
    raise ValueError(f"index {index} outside known chart sections")


def chart_swatches(page, words, seps, product_range, sections):
    swatches = [
        r for r in page.rects
        if r["fill"] and 35 <= r["width"] <= 42 and 21 <= r["height"] <= 26
    ]
    colors = []
    for w in words:
        if not CODE_RE.match(w["text"]):
            continue
        above = [
            r for r in swatches
            if abs(r["x0"] - w["x0"]) < 3 and 0 <= w["top"] - r["bottom"] < 10
        ]
        if not above:
            continue  # equivalence tables, combination grids, image swatches
        if len(above) > 1:
            raise ValueError(f"ambiguous swatch for {w['text']}")
        swatch = above[0]
        right = swatch["x1"]
        index = next(
            int(v["text"]) for v in words
            if v["text"].isdigit() and abs(v["top"] - w["top"]) < 1.5
            and w["x1"] < v["x0"] < right + 2
        )
        first_line = sorted(
            (v for v in words
             if v is not w and w["x0"] - 1 <= v["x0"] < right
             and 2 < v["top"] - w["top"] < 9),
            key=lambda v: v["x0"],
        )
        kind, heading = section(index, sections)
        colors.append({
            "code": w["text"],
            "name": expand(" ".join(v["text"] for v in first_line)),
            "range": product_range,
            "type": kind,
            "cmyk": fill_to_cmyk(swatch["non_stroking_color"], seps),
            "heading": heading,
            # Chart order: the printed index, then position (one index repeats).
            "order": (index, w["top"], w["x0"]),
        })
    return colors


def chart_layout(colors):
    """Group chart-ordered colors into headed sections of printed rows."""
    sections = []
    prev = None
    for c in colors:
        _, top, x0 = c["order"]
        if not sections or sections[-1]["title"] != c["heading"]:
            sections.append({"title": c["heading"], "rows": [[]]})
        elif abs(top - prev[1]) > 2 or x0 < prev[2]:
            sections[-1]["rows"].append([])
        sections[-1]["rows"][-1].append(c["code"])
        prev = c["order"]
    return sections


def cmyk_percent(cmyk):
    """Chart CMYK (0..1, whole percent in the PDFs) -> {c, m, y, k} in percent."""
    values = [round(v * 100, 2) for v in cmyk]
    if any(v != int(v) for v in values):
        raise ValueError(f"non-integer CMYK percentage in {cmyk}")
    return dict(zip("cmyk", (int(v) for v in values)))


def cmyk_to_srgb_hex(cmyk, transform):
    pixel = Image.new("CMYK", (1, 1), tuple(round(v * 255) for v in cmyk))
    r, g, b = ImageCms.applyTransform(pixel, transform).getpixel((0, 0))
    return f"#{r:02X}{g:02X}{b:02X}"


def cmyk_to_cielab(cmyk, to_lab):
    L, a, b = to_lab([v * 100 for v in cmyk])
    return {"l": round(L, 2), "a": round(a, 2), "b": round(b, 2)}


def process(path, product_range, sections):
    pdf = pdfplumber.open(path)
    page = pdf.pages[0]
    seps = separations(page)
    # Split on font changes: index numbers otherwise merge with the next code.
    words = page.extract_words(extra_attrs=["fontname", "size"])
    profile = output_intent_profile(pdf)
    to_lab = CmykToLab(profile)
    transform = ImageCms.buildTransform(
        ImageCms.ImageCmsProfile(io.BytesIO(profile)),
        ImageCms.createProfile("sRGB"), "CMYK", "RGB",
        renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
        flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
    )

    colors = [
        c for c in chart_swatches(page, words, seps, product_range, sections)
        if c["heading"]
    ]
    counts = {}
    for c in colors:
        counts[c["type"]] = counts.get(c["type"], 0) + 1
    if counts != EXPECTED_COUNTS[product_range]:
        raise ValueError(f"{product_range}: unexpected counts {counts}")
    colors.sort(key=lambda c: c["order"])
    layout = chart_layout(colors)

    by_code = {}
    for c in colors:
        cmyk = c["cmyk"]
        by_code[c["code"]] = {
            "code": c["code"],
            "name": c["name"],
            "range": c["range"],
            "type": c["type"],
            "rgb": cmyk_to_srgb_hex(cmyk, transform),
            "cmyk": cmyk_percent(cmyk),
            "cielab": cmyk_to_cielab(cmyk, to_lab),
        }

    return by_code, layout


def main(game_pdf, model_pdf, out_dir):
    colors = {}
    layouts = {}
    for path, product_range, sections, key in (
        (game_pdf, "Game Color", GAME_SECTIONS, "gameColor"),
        (model_pdf, "Model Color", MODEL_SECTIONS, "modelColor"),
    ):
        by_code, layout = process(path, product_range, sections)
        if colors.keys() & by_code.keys():
            raise ValueError("duplicate codes across ranges")
        colors.update(by_code)
        layouts[key] = {
            "title": f"{product_range} chart",
            "source": SOURCES[product_range],
            "sections": layout,
        }

    vallejo_data.update(out_dir, set(SOURCES), colors, layouts)
    print(f"wrote {len(colors)} colors and {len(layouts)} layouts to {out_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
