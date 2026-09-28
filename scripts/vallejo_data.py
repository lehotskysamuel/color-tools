"""Read and write data/vallejo.json and data/vallejo-layouts.json.

Each extractor owns some product ranges and layout keys and replaces only
those, so running one extractor keeps what the others wrote.
"""
import json
import re
from pathlib import Path

COLORS_FILE = "vallejo.json"
LAYOUTS_FILE = "vallejo-layouts.json"


def format_colors(colors):
    """One color per line, so each diff line is one color."""
    lines = [
        f"  {json.dumps(code)}: {json.dumps(color, ensure_ascii=False)}"
        for code, color in colors.items()
    ]
    return "{\n" + ",\n".join(lines) + "\n}\n"


def format_layouts(layouts):
    """Indented JSON with each innermost list of codes on one line."""
    text = json.dumps(layouts, indent=2, ensure_ascii=False)
    return re.sub(
        r"\[\s+(\"[^\"\]]*\"(?:,\s+\"[^\"\]]*\")*)\s+\]",
        lambda m: "[" + re.sub(r",\s+", ", ", m.group(1)) + "]",
        text,
    ) + "\n"


def _load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _codes(layout):
    return {code for section in layout["sections"] for row in section["rows"] for code in row}


def update(out_dir, ranges, colors, layouts):
    """Replace every color whose range is in `ranges` with `colors`, and the
    layouts made only of those colors with `layouts`. Other colors and layouts
    are kept. A layout key that exists already keeps its position; new keys are
    appended."""
    out = Path(out_dir)
    colors_path, layouts_path = out / COLORS_FILE, out / LAYOUTS_FILE

    existing = _load(colors_path)
    replaced = {code for code, c in existing.items() if c["range"] in ranges}
    kept = {code: c for code, c in existing.items() if code not in replaced}
    if kept.keys() & colors.keys():
        raise ValueError(f"codes already used by another range: {sorted(kept.keys() & colors.keys())}")
    colors_path.write_text(format_colors(dict(sorted({**kept, **colors}.items()))), encoding="utf-8")

    merged = {}
    for key, layout in _load(layouts_path).items():
        if key in layouts:
            merged[key] = layouts[key]
        elif not _codes(layout) <= replaced:  # a stale layout of these ranges is dropped
            merged[key] = layout
    merged.update(layouts)
    layouts_path.write_text(format_layouts(merged), encoding="utf-8")
