"""Extract paint swatch colors from the Squidmar Color promo images.

Finds every brush-stroke swatch, orders them in reading order (row by row,
left to right) and samples the dominant fill color, ignoring the printed
code, the anti-aliased edges and the black background.

    pip install -r requirements.txt
    python extract_colors.py          # writes colors.json and colors.md

Metallic swatches are drawn as gradients in the source, so their RGB is the
dominant mid-tone of the gradient, not a single flat color.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).parent

METALLIC = {"74.249", "74.250", "74.251", "74.252", "74.253", "74.254", "74.255"}

# Transcribed from the images, one line per swatch row, in reading order.
SHEETS = [
    {
        "id": "30",
        "title": "30 New Paints",
        "image": "source/30-new-paints.webp",
        "columns": 5,
        "top": 400,         # first pixel row below the headline
        "threshold": 12,    # max channel value that still counts as background
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
    {
        "id": "72",
        "title": "72 New Paints",
        "image": "source/72-new-paints.webp",
        "columns": 6,
        "top": 330,
        "threshold": 18,    # the swatch panel is near-black, not pure black
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
]


def parse_rows(text):
    return [
        [tuple(cell.split(" ", 1)) for cell in line.split("|")]
        for line in text.strip().splitlines()
    ]


def find_swatches(img, top, threshold, max_height):
    """Bounding boxes and masks of swatch blobs, grouped into rows."""
    fg = img.max(axis=2) > threshold
    fg[:top] = False
    labels, _ = ndi.label(ndi.binary_closing(fg, structure=np.ones((5, 5))))
    blobs = []
    for idx, sl in enumerate(ndi.find_objects(labels), start=1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h > 40 and w > 100:  # labels under the swatches are shorter than this
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


def dominant_color(pixels, radius=22, iterations=6):
    """Most common fill color: coarse histogram mode, refined by a
    median mean-shift so text and shading don't pull the value."""
    bins, counts = np.unique(pixels // 16, axis=0, return_counts=True)
    estimate = bins[counts.argmax()] * 16 + 8
    for _ in range(iterations):
        near = np.sqrt(((pixels - estimate) ** 2).sum(axis=1)) < radius
        estimate = np.median(pixels[near], axis=0)
    return [int(round(v)) for v in estimate]


def extract(sheet):
    img = np.asarray(Image.open(HERE / sheet["image"]).convert("RGB")).astype(int)
    rows = find_swatches(img, sheet["top"], sheet["threshold"], sheet["max_height"])
    names = parse_rows(sheet["rows"])
    assert [len(r) for r in rows] == [len(r) for r in names], "swatch grid mismatch"

    paints = []
    for swatch_row, name_row in zip(rows, names):
        for ((y0, y1, x0, x1), mask), (code, name) in zip(swatch_row, name_row):
            inner = ndi.binary_erosion(mask, structure=np.ones((5, 5)))
            rgb = dominant_color(img[y0:y1, x0:x1][inner])
            paints.append({
                "code": code,
                "name": name,
                "rgb": rgb,
                "hex": "#{:02X}{:02X}{:02X}".format(*rgb),
                "metallic": code in METALLIC,
            })
    return paints


def write_markdown(sheets, path):
    lines = [
        "# Squidmar Color paints",
        "",
        "Sampled from the promo images in `source/`, in the same order as the images",
        "(row by row, left to right). Metallic RGB values are the dominant mid-tone",
        "of a gradient.",
    ]
    for sheet in sheets:
        lines += ["", f"## {sheet['title']}", "", "| # | Code | Name | RGB | Hex |", "|---|---|---|---|---|"]
        for i, p in enumerate(sheet["paints"], start=1):
            name = p["name"] + (" *(metallic)*" if p["metallic"] else "")
            rgb = ", ".join(map(str, p["rgb"]))
            lines.append(f"| {i} | {p['code']} | {name} | {rgb} | `{p['hex']}` |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    out = []
    for sheet in SHEETS:
        out.append({
            "id": sheet["id"],
            "title": sheet["title"],
            "image": sheet["image"],
            "columns": sheet["columns"],
            "paints": extract(sheet),
        })
    (HERE / "colors.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_markdown(out, HERE / "colors.md")
    for sheet in out:
        print(f"{sheet['title']}: {len(sheet['paints'])} paints")


if __name__ == "__main__":
    main()
