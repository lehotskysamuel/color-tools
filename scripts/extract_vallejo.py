"""Build data/vallejo.json from Vallejo's official color chart PDFs.

Usage:
    pip install -r scripts/requirements.txt
    curl -A "Mozilla/5.0" -o game.pdf  https://acrylicosvallejo.com/wp-content/uploads/2025/09/CC266-Game_Color.pdf
    curl -A "Mozilla/5.0" -o model.pdf https://acrylicosvallejo.com/wp-content/uploads/2024/03/CC329-R00-Model-Color-NewIC.pdf
    python scripts/extract_vallejo.py game.pdf model.pdf data/vallejo.json

Every swatch in the charts is a filled rectangle with its code label directly
below it, followed by a running index number and the name (Model Color also
prints a Spanish name on a second line). Fills are print values: DeviceCMYK,
or /Separation spot colors whose alternate space is DeviceCMYK. They are
converted to sRGB through the chart's own output intent ICC profile
(Coated FOGRA39) using relative colorimetric intent with black point
compensation, the Adobe default for displaying CMYK documents. The print
CMYK itself is kept too, in percent. Colors are written in chart order.
"""
import io
import json
import re
import sys

import pdfplumber
from PIL import Image, ImageCms
from pdfminer.pdfcolor import PDFColorSpace
from pdfminer.pdfinterp import PDFPageInterpreter
from pdfminer.pdftypes import resolve1
from pdfminer.psparser import literal_name

CODE_RE = re.compile(r"^\d{2}\.\d{3}$")

# Chart index ranges (the small number printed next to each code).
GAME_SECTIONS = [
    (1, 79, "opaque"),
    (81, 88, "wash"),
    (89, 100, "special-fx"),
    (101, 108, "fluorescent"),
    (109, 120, "ink"),
    (121, 129, "metallic"),
]
MODEL_SECTIONS = [
    (1, 192, "opaque"),
    (193, 194, "ink"),
    (195, 204, "metallic"),
]
# Special FX swatches are photo textures without a single flat color.
EXCLUDED_TYPES = {"metallic", "special-fx"}
EXPECTED_COUNTS = {
    "Game Color": {"opaque": 80, "wash": 8, "fluorescent": 8, "ink": 12},
    "Model Color": {"opaque": 192, "ink": 2},
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
    for lo, hi, kind in sections:
        if lo <= index <= hi:
            return kind
    raise ValueError(f"index {index} outside known chart sections")


def extract(path, product_range, sections):
    pdf = pdfplumber.open(path)
    page = pdf.pages[0]
    seps = separations(page)
    # Split on font changes: index numbers otherwise merge with the next code.
    words = page.extract_words(extra_attrs=["fontname", "size"])
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
        colors.append({
            "code": w["text"],
            "name": expand(" ".join(v["text"] for v in first_line)),
            "range": product_range,
            "type": section(index, sections),
            "cmyk": fill_to_cmyk(swatch["non_stroking_color"], seps),
            # Chart order: the printed index, then position (one index repeats).
            "order": (index, round(w["top"]), w["x0"]),
        })
    return colors, output_intent_profile(pdf)


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


def main(game_pdf, model_pdf, out_path):
    srgb = ImageCms.createProfile("sRGB")
    result = []
    for path, product_range, sections in (
        (game_pdf, "Game Color", GAME_SECTIONS),
        (model_pdf, "Model Color", MODEL_SECTIONS),
    ):
        colors, icc = extract(path, product_range, sections)
        transform = ImageCms.buildTransform(
            ImageCms.ImageCmsProfile(io.BytesIO(icc)), srgb, "CMYK", "RGB",
            renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
            flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
        )
        kept = [c for c in colors if c["type"] not in EXCLUDED_TYPES]
        counts = {}
        for c in kept:
            counts[c["type"]] = counts.get(c["type"], 0) + 1
        if counts != EXPECTED_COUNTS[product_range]:
            raise ValueError(f"{product_range}: unexpected counts {counts}")
        kept.sort(key=lambda c: c.pop("order"))
        for c in kept:
            cmyk = c.pop("cmyk")
            c["rgb"] = cmyk_to_srgb_hex(cmyk, transform)
            c["cmyk"] = cmyk_percent(cmyk)
        result.extend(kept)

    codes = [c["code"] for c in result]
    if len(codes) != len(set(codes)):
        raise ValueError("duplicate codes")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(result)} colors to {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
