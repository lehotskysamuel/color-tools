"""Add `webhex` to the Game Color and Model Color entries of data/vallejo.json:
the color Vallejo's website shows for each paint.

Usage:
    pip install -r scripts/requirements.txt
    python scripts/extract_vallejo_webhex.py data [image-dir]

The images are downloaded again on every run unless an image-dir is given to
keep them in.

Vallejo's website gives no color value as text or CSS. Each product page shows
one 800 x 800 image: the bottle, and behind it, in the top left corner, a band
in the paint's color with a diagonal edge. That band is the paint's web
color. The product pages sit behind a bot check, but the images in the site's
uploads folder do not, so the script downloads those. Their names follow the
range and type, with a few exceptions (IMAGE_EXCEPTIONS).

- On every image except the washes', the band is one flat color. The script
  takes the value of a window that lies inside the band on every image, and
  stops if the window holds more than one color. JPEG keeps a flat area
  exact.
- On a wash's image the band fades from the color at its bottom left corner
  to white, like a wash thinning out. Its `webhex` is that corner's color.
- Model Color images are tagged sRGB and Game Color images are untagged,
  which browsers also show as sRGB, so the pixel values are the web colors.

The web colors turn out to be the chart's print CMYK converted to sRGB for
display (Coated FOGRA39, relative colorimetric with black point
compensation): an exact conversion matches all of them within 3 units per
channel. So they agree with `rgb`, which was made the same way, except where
Pillow's 8-bit conversion of `rgb` is off, by up to 14 units next to the sRGB
edge. A web color further than MAX_CHART_DIFF from `rgb` means the image shows
another paint, and stops the script.
"""
import io
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms

import vallejo_data

RANGES = {"Game Color", "Model Color"}

UPLOADS = "https://acrylicosvallejo.com/wp-content/uploads/"

# Older uploads and names that do not follow the pattern (70.961 has a typo).
IMAGE_EXCEPTIONS = {
    "70.815": "2018/06/vallejo-model-color-70815-newIC.jpg",
    "70.874": "2024/02/vallejo-model-color-70874-newIC1.jpg",
    "70.961": "2024/02/vallejo-model-color-707961-newIC.jpg",
    "72.034": "2024/01/vallejo-game-color-72034.jpg",
}

SIZE = (800, 800)
SRGB_PROFILES = {None, "sRGB IEC61966-2.1"}

# Inside the band on every image: its top edge runs from (0, 135) to (360, 0),
# its right edge from (360, 0) to (90, 800).
BAND = (slice(200, 760), slice(8, 72))  # rows, columns
# A wash band's full-strength corner: the bottom left JPEG block.
WASH_CORNER = (slice(792, 800), slice(0, 8))

# Largest per-channel difference from the chart's `rgb`. Pillow's error next to
# the sRGB edge accounts for up to 14 (72.122 Bile Green).
MAX_CHART_DIFF = 16


def image_url(code, color):
    if code in IMAGE_EXCEPTIONS:
        return UPLOADS + IMAGE_EXCEPTIONS[code]
    number = code.replace(".", "")
    if color["range"] == "Model Color":
        return f"{UPLOADS}2024/02/vallejo-model-color-{number}-newIC.jpg"
    if color["type"] == "acrylic":
        return f"{UPLOADS}2024/01/vallejo-game-color-{number}-1.jpg"
    kind = {"ink": "ink", "wash": "wash", "fluorescent": "fluo"}[color["type"]]
    return f"{UPLOADS}2023/11/vallejo-game-color-{kind}-{number}-1.jpg"


def fetch(url, image_dir):
    path = image_dir / url.rsplit("/", 1)[1] if image_dir else None
    if path and path.exists():
        return path.read_bytes()
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    if path:
        path.write_bytes(data)
    return data


def web_color(data, paint_type, url):
    img = Image.open(io.BytesIO(data))
    icc = img.info.get("icc_profile")
    profile = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))).strip() if icc else None
    if img.size != SIZE or profile not in SRGB_PROFILES:
        raise ValueError(f"{url}: expected an sRGB image of {SIZE}, got {img.size} in {profile!r}")
    pixels = np.asarray(img.convert("RGB")).astype(int)
    region = pixels[WASH_CORNER if paint_type == "wash" else BAND].reshape(-1, 3)
    if paint_type != "wash" and np.ptp(region, axis=0).max() > 0:
        raise ValueError(f"{url}: the band is not one flat color")
    return tuple(int(round(v)) for v in np.median(region, axis=0))


def main(out_dir, image_dir=None):
    image_dir = Path(image_dir) if image_dir else None
    if image_dir:
        image_dir.mkdir(parents=True, exist_ok=True)

    webhex = {}
    for code, color in vallejo_data.load_colors(out_dir).items():
        if color["range"] not in RANGES:
            continue
        url = image_url(code, color)
        rgb = web_color(fetch(url, image_dir), color["type"], url)
        chart = [int(color["rgb"][i:i + 2], 16) for i in (1, 3, 5)]
        diff = max(abs(a - b) for a, b in zip(rgb, chart))
        if diff > MAX_CHART_DIFF:
            raise ValueError(f"{code}: web color {rgb} is {diff} from the chart's {color['rgb']}: {url}")
        webhex[code] = "#{:02X}{:02X}{:02X}".format(*rgb)

    vallejo_data.set_field(out_dir, "webhex", webhex)
    print(f"wrote webhex for {len(webhex)} colors to {out_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
