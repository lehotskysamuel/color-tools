"""Add Squidmar Color to data/vallejo.json and data/vallejo-layouts.json.

Usage:
    pip install -r scripts/requirements.txt
    python scripts/extract_squidmar.py data/sources/squidmar-mega-set.webp \\
        data/sources/squidmar-essentials.webp data
    node scripts/add-oklch.js data/vallejo.json

Squidmar Color (by Vallejo, codes 74.2xx) has no published color chart, so
the source is the announcement images of its two sets: the Mega Set, all 72
paints (headed "72 New Paints"), and the Essentials, 30 of them (headed "30
New Paints"). Each swatch is a brush stroke with the code printed on it and
the name below. The script finds every stroke, puts them in
reading order, and takes the dominant fill color, ignoring the printed code,
the anti-aliased edges and the black background.

Colors come from the Mega Set image. The Essentials image is sampled too, as
a check: each of its paints must match the Mega Set value within
MAX_SHEET_DIFF.

Metallics are drawn as gradients, so their color is the gradient's dominant
mid-tone. There is no print CMYK or other color data, so `cmyk` and `cielab`
are null and the page uses `rgb`. The images are what the manufacturer shows
on the web, so `webhex` holds the same value as `rgb`.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import vallejo_data

RANGE = "Squidmar Color"

TYPES = [
    (201, 248, "acrylic"),
    (249, 255, "metallic"),
    (256, 260, "fluorescent"),
    (261, 272, "ink"),
]
EXPECTED_COUNTS = {"acrylic": 48, "metallic": 7, "fluorescent": 5, "ink": 12}

# Words the images truncate to fit the label width.
ABBREVIATIONS = {"Fluoresc": "Fluorescent"}

# Largest per-channel difference allowed between the two images for the same
# paint. It is compression noise; the largest seen is 5 (74.201, whose stroke
# is shaded).
MAX_SHEET_DIFF = 8

# Transcribed from the images: one line per printed row of swatches, a blank
# line between the image's panels. Each panel becomes one layout section.
SHEETS = {
    "squidmarColorMegaSet": {
        "title": "Squidmar Color Mega Set",
        "source": 'Squidmar Color Mega Set announcement image ("72 New Paints")',
        "top": 330,         # first pixel row below the headline
        "threshold": 18,    # the panels are near-black, not pure black
        "max_height": 52,
        "rows": """
74.201 Holy Wight|74.202 Old Skull|74.203 Northern Tan|74.204 Sun Kissed Skin|74.205 Dunskär Skin|74.206 Steve Flesh
74.213 Deadliest Red|74.214 Murdered|74.215 Gut Red|74.216 Tentacle Pink|74.217 Hell Pink|74.218 Witches Purple
74.225 Ghastly Turquoise|74.226 Spearmint|74.227 Gemstone|74.228 Corrupted Emerald|74.229 Deep Blue Sea|74.230 Cauldron Green
74.237 Ancient Tome|74.238 Corpse Yellow|74.239 Undead Ochre|74.240 Rich Brown|74.241 Leathery Brown|74.242 Deep Wood
74.249 Godly Steel|74.250 Metallic Metal|74.251 Dark Steel|74.252 Dragon Gold|74.253 Demon Gold|74.254 Graveyard Copper
74.261 Sun Ink|74.262 Fire Ink|74.263 Blood Ink|74.264 Squid Ink|74.265 Witch Ink|74.266 Deep Sea Ink

74.207 Cursed Skin|74.208 Final Yellow|74.209 Owl’s Eye|74.210 Goldcoin Yellow|74.211 Squid Orange|74.212 Tetanus Orange
74.219 Tulip Fever|74.220 Infernal Purple|74.221 Snow Storm|74.222 I’m Blue|74.223 Mörk Blue|74.224 Ocean Eyes
74.231 Birch Leaf|74.232 Drachonzah Green|74.233 Vomitous Green|74.234 Mossback Green|74.235 Mehnadi Desert|74.236 Bone Dust
74.243 Blackwood|74.244 Cult Brown|74.245 Knights Brown|74.246 Ume Grey|74.247 Granite Grey|74.248 Pitch Black
74.255 Ungodly Copper|74.256 Fluorescent Sun|74.257 Fluorescent Fire|74.258 Fluorescent Hex|74.259 Fluoresc Ghost|74.260 Fluorescent Fae
74.267 Ghostly Ink|74.268 Ork Ink|74.269 Moss Ink|74.270 Ancient Ink|74.271 Leather Ink|74.272 Pitch Black Ink
""",
    },
    "squidmarColorEssentials": {
        "title": "Squidmar Color Essentials",
        "source": 'Squidmar Color Essentials announcement image ("30 New Paints")',
        "top": 400,
        "threshold": 12,
        "max_height": 84,   # Pitch Black's glow merges with its label; clip it
        "rows": """
74.201 Holy Wight|74.203 Northern Tan|74.204 Sun Kissed Skin|74.207 Cursed Skin|74.208 Final Yellow
74.221 Snow Storm|74.225 Ghastly Turquoise|74.226 Spearmint|74.229 Deep Blue Sea|74.230 Cauldron Green
74.241 Leathery Brown|74.243 Blackwood|74.244 Cult Brown|74.246 Ume Grey|74.248 Pitch Black

74.210 Goldcoin Yellow|74.212 Tetanus Orange|74.214 Murdered|74.217 Hell Pink|74.220 Infernal Purple
74.232 Drachonzah Green|74.234 Mossback Green|74.235 Mehnadi Desert|74.239 Undead Ochre|74.240 Rich Brown
74.250 Metallic Metal|74.251 Dark Steel|74.253 Demon Gold|74.254 Graveyard Copper|74.255 Ungodly Copper
""",
    },
}


def parse_sections(text):
    """Panels -> rows -> (code, name) cells."""
    return [
        [[tuple(cell.split(" ", 1)) for cell in line.split("|")] for line in block.splitlines()]
        for block in text.strip().split("\n\n")
    ]


def expand(name):
    return " ".join(ABBREVIATIONS.get(word, word) for word in name.split())


def paint_type(code):
    number = int(code.split(".")[1])
    for lo, hi, kind in TYPES:
        if lo <= number <= hi:
            return kind
    raise ValueError(f"{code} outside known Squidmar Color ranges")


def find_rows(img, top, threshold, max_height):
    """Swatch strokes as (box, mask), grouped into printed rows, left to right."""
    fg = img.max(axis=2) > threshold
    fg[:top] = False
    labels, _ = ndi.label(ndi.binary_closing(fg, structure=np.ones((5, 5))))
    blobs = []
    for idx, sl in enumerate(ndi.find_objects(labels), start=1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h > 40 and w > 100:  # the name labels under the strokes are shorter
            y0, x0, x1 = sl[0].start, sl[1].start, sl[1].stop
            y1 = min(sl[0].stop, y0 + max_height)
            mask = (labels[y0:y1, x0:x1] == idx) & fg[y0:y1, x0:x1]
            blobs.append(((y0, y1, x0, x1), mask))

    blobs.sort(key=lambda b: b[0][0])
    rows = []
    for blob in blobs:
        if rows and abs(blob[0][0] - rows[-1][0][0][0]) < 20:
            rows[-1].append(blob)
        else:
            rows.append([blob])
    return [sorted(row, key=lambda b: b[0][2]) for row in rows]


def check_panels(rows, sections):
    """Each panel of the image starts at its own left edge; the transcribed
    panel breaks must fall exactly where that edge moves."""
    lefts = [row[0][0][2] for row in rows]
    sizes, run = [], 1
    for prev, left in zip(lefts, lefts[1:]):
        if abs(left - prev) > 4:
            sizes.append(run)
            run = 0
        run += 1
    sizes.append(run)
    if sizes != [len(s) for s in sections]:
        raise ValueError(f"panels have {sizes} rows, transcription has {[len(s) for s in sections]}")


def dominant_color(pixels, radius=22, iterations=6):
    """Most common fill color: coarse histogram mode, refined by a median
    mean-shift so the printed code and shading don't pull the value."""
    bins, counts = np.unique(pixels // 16, axis=0, return_counts=True)
    estimate = bins[counts.argmax()] * 16 + 8
    for _ in range(iterations):
        near = np.sqrt(((pixels - estimate) ** 2).sum(axis=1)) < radius
        estimate = np.median(pixels[near], axis=0)
    return tuple(int(round(v)) for v in estimate)


def sample(path, sheet):
    """(code, printed name, rgb) in reading order, and the layout sections."""
    img = np.asarray(Image.open(path).convert("RGB")).astype(int)
    rows = find_rows(img, sheet["top"], sheet["threshold"], sheet["max_height"])
    sections = parse_sections(sheet["rows"])
    names = [row for section in sections for row in section]
    if [len(r) for r in rows] != [len(r) for r in names]:
        raise ValueError(f"{path}: swatch grid {[len(r) for r in rows]} does not match transcription")
    check_panels(rows, sections)

    paints = []
    for swatch_row, name_row in zip(rows, names):
        for ((y0, y1, x0, x1), mask), (code, name) in zip(swatch_row, name_row):
            inner = ndi.binary_erosion(mask, structure=np.ones((5, 5)))
            paints.append((code, name, dominant_color(img[y0:y1, x0:x1][inner])))
    layout = [{"rows": [[code for code, _ in row] for row in section]} for section in sections]
    return paints, layout


def main(mega_set, essentials, out_dir):
    paints, mega_layout = sample(mega_set, SHEETS["squidmarColorMegaSet"])
    subset, essentials_layout = sample(essentials, SHEETS["squidmarColorEssentials"])

    colors = {}
    for code, name, (r, g, b) in paints:
        if code in colors:
            raise ValueError(f"duplicate code {code}")
        hex_color = f"#{r:02X}{g:02X}{b:02X}"
        colors[code] = {
            "code": code,
            "name": expand(name),
            "range": RANGE,
            "type": paint_type(code),
            "rgb": hex_color,
            "webhex": hex_color,
            "cmyk": None,
            "cielab": None,
        }
    counts = {}
    for c in colors.values():
        counts[c["type"]] = counts.get(c["type"], 0) + 1
    if counts != EXPECTED_COUNTS:
        raise ValueError(f"unexpected counts {counts}")

    mega_rgb = {code: rgb for code, _, rgb in paints}
    for code, name, rgb in subset:
        if code not in colors or expand(name) != colors[code]["name"]:
            raise ValueError(f"{code} {name!r} on the Essentials image does not match the Mega Set image")
        diff = max(abs(a - b) for a, b in zip(rgb, mega_rgb[code]))
        if diff > MAX_SHEET_DIFF:
            raise ValueError(f"{code}: images disagree by {diff} ({rgb} vs {mega_rgb[code]})")

    layouts = {
        key: {"title": SHEETS[key]["title"], "source": SHEETS[key]["source"], "sections": layout}
        for key, layout in (("squidmarColorMegaSet", mega_layout), ("squidmarColorEssentials", essentials_layout))
    }
    vallejo_data.update(out_dir, {RANGE}, dict(sorted(colors.items())), layouts)
    print(f"wrote {len(colors)} colors and {len(layouts)} layouts to {out_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
