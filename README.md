# color-tools

Browser tools for seeing color the way people perceive it. The first one, **OKLCh Atlas**, draws the sRGB
gamut and Pointer's gamut of real surface colors in OKLab, so that distance on screen matches perceived color
difference, and measures how much of them a set of paints covers.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # color math unit tests (Vitest)
npm run build      # typecheck + production build into dist/
```

Stack: Vite, TypeScript, three.js. No UI framework yet.

## Deployment

`.github/workflows/pages.yml` publishes to the `gh-pages` branch, which GitHub Pages serves:

| Event | Result |
|---|---|
| Push or merge to `main` | https://lehotskysamuel.github.io/color-tools/main/ is updated |
| PR #N opened, reopened or updated | https://lehotskysamuel.github.io/color-tools/pr-N/ is (re)built, and its link is commented on the PR |
| PR #N merged | `pr-N/` is removed. The merge itself updates `main/` |
| PR #N closed without merging | `pr-N/` is removed |

- https://lehotskysamuel.github.io/color-tools/ redirects to `main/`.
- Any missing page outside `main/`, such as the link to a removed preview, also goes to `main/`.
- Tests and the build run before every publish, so a failing test blocks it.
- Previews are skipped for PRs from forks, whose token can't push.

`.github/scripts/publish-pages.sh <folder> [build-dir]` does the publishing:

- It replaces or removes one folder and rewrites the root redirect pages.
- It keeps `gh-pages` as a single commit, so the branch doesn't grow with every deploy.
- It pushes with `--force-with-lease` and retries, so deploys that run at the same moment don't overwrite each
  other. That happens on every merge, when the `main/` deploy and the `pr-N/` removal run together.

One-time setup, in the repository settings:

1. The repository must be public (GitHub Pages on a private repository needs a paid plan).
2. In Settings → Pages → Build and deployment, set Source to **Deploy from a branch**, then choose `gh-pages` and
   `/ (root)`.

## Why OKLCh and not HSL

HSL and HSV are the RGB cube reshaped into a cylinder. Equal steps in their numbers are not equal steps to the
eye. Measured in OKLab (ΔE<sub>OK</sub>), twelve equal 30° hue steps of fully saturated HSL colors range from
**0.050** (chartreuse → green) to **0.351** (cyan → azure), a 7× spread. HSL gives pure yellow and pure blue the
same "L = 50%", but their perceived lightness is 0.97 and 0.45.

OKLab (Björn Ottosson, 2020) is built so that straight-line distance approximates perceived difference.
OKLCh is the same space in polar form: lightness **L**, chroma **C** and hue angle **h**. A ΔE<sub>OK</sub> of
about 0.02 is one just-noticeable difference (the threshold CSS Color 4 uses for gamut mapping).

## The views

All three views use OKLab geometry with **one pixel scale for every axis**. In the 2D slices, a given on-screen
distance is the same perceptual difference everywhere, in both slices.

| | View | Shows | Distances |
|---|---|---|---|
| **A** | Gamut solid (3D) | A color space's gamut at its OKLab position, L pointing up: Pointer's gamut (default) or every sRGB color. With it, the convex hull of the shown paints. Drag to orbit, scroll to zoom. The solids can be cut at the current L, at the current hue, or with a wedge that removes one quarter. Each shape is drawn as a see-through **wireframe** or an opaque **solid**; the cut still decides which slices show inside a wireframe. See [Pointer's gamut and the paint hull](#pointers-gamut-and-the-paint-hull). | Correct in 3D. The on-screen projection is only faithful for pairs parallel to the screen. The camera is orthographic, so there is no perspective distortion on top of that. |
| **B.1** | Lightness slice | A horizontal cut at one lightness. Hue is the angle, chroma the radius. | Exact within the slice. |
| **B.2** | Hue slice | A vertical plane through the gray axis. Hue h on the right, its complement h + 180° on the left, L up. It is a true plane, so the complement half is not mirrored or stretched. Diamonds mark each half's cusp, its most chromatic point. | Exact within the slice, including across the gray axis. |

The views are linked:

- The cut faces of the solid (A) are the slice images of B.1 and B.2, uploaded as textures.
- B.1 shows where B.2 cuts it (dashed line through the center), and B.2 shows where B.1 cuts it (dashed horizontal line).
- Clicking a color or a paint dot in any view picks it and moves both slices to pass through it. So does switching
  a Vallejo paint on.
- Hovering shows the color's OKLCh, hex and ΔE<sub>OK</sub> from the picked color, in JND units.
- Hatched areas are outside sRGB. No screen color exists there.

The page chrome is deliberately achromatic. A tinted surround shifts how the plotted colors look.

### Vallejo paints

The pane to the left of the views shows the paints from `data/vallejo.json`, laid out as they are printed. The
**Layout** select switches between the six layouts in `data/vallejo-layouts.json` (Game Color chart and
combinations, Model Color chart and combinations, Squidmar Color Mega Set and Essentials) plus **All paints**, the
charts and the Mega Set one after the other, which holds every paint in the catalog once. The page remembers the
choice in `localStorage`.

**Showing paints.** The paints that are switched on are drawn as dots in the views. A new layout starts with all of
its paints on, and **Select all** / **Select none** switch them all at once.

- Clicking a swatch switches its paint on or off. An off swatch shrinks to a small square with a dashed border,
  still in its own color.
- Switching a paint on also *picks* it: both slices move to pass through it, and the readout shows its code and
  name. Switching a paint off leaves the pick alone, so double-clicking a paint that is on (off, then on) picks it.
- Clicking a paint's dot in any view picks that paint. Hovering a dot or a swatch shows the paint in the tooltip
  with its ΔE<sub>OK</sub> from the picked color.
- The picked paint's swatch is outlined wherever it appears. The combination tables repeat paints, so a paint can
  be outlined several times, which shows every triplet it belongs to.
- Picking a color of the space itself (not a dot) clears the picked paint.

**Where the dots are drawn.**

- **A (solid):** every dot that is on, drawn after the solid with a fresh depth buffer. No dot hides inside the
  solid, and nearer dots still cover farther ones. The flip side: a dot behind the solid looks as if it sat on
  its front surface, so orbit the solid to judge depth, or draw it as a **Wireframe** to see through it. Dots are
  drawn over the slice planes inside the cage too. Dots keep a fixed size on screen when zooming.
- **B.1 and B.2 (slices):** only paints within ΔE<sub>OK</sub> 0.04 of the slice plane (`PAINT_BAND` in
  `src/views/slicePlot.ts`), at their orthogonal projection onto it. The farther from the plane, the fainter the
  dot. A dot's position is exact only for a paint that lies on the plane; at the band's edge it can be off by up
  to 0.04.

Every paint sits at its best-known color: `cielab` when the data has one, else `rgb` (see
[`data/vallejo.json`](#datavallejojson)). Ten chart colors, mostly teals and turquoises, lie outside sRGB. They sit
at their true position and are drawn in the nearest screen color of the same lightness and hue, and the tooltip
and the readout say that they are outside sRGB.

### Pointer's gamut and the paint hull

View A draws two shapes, each with its own options under the solid:

| Shape | Options | Default |
|---|---|---|
| **Color space** | **sRGB** or **Pointer's** gamut; **Wireframe** or **Solid** | Pointer's, wireframe |
| **Paint hull** | **On** or **Off**; **Wireframe** or **Solid** | On, solid |

**Pointer's gamut** is the gamut of real surface colors: M. R. Pointer measured 4089 samples of paints, inks,
plastics and textiles and published, for every 5 units of CIELAB lightness (L\* 15 to 90) and every 10° of hue,
the highest chroma any of them reached ("The gamut of real surface colours", *Color Research & Application* 5,
1980). The table (`src/color/pointer.ts`) is the one [colour-science](https://www.colour-science.org/) publishes.
It is in CIE LCh under illuminant C. Each point is converted to OKLab through XYZ, with Bradford adaptation from
C to D65, so a neutral surface stays neutral and white maps to OKLab L = 1.

- Between table entries, chroma is linear in L\* and in hue.
- The table stops at L\* 15 and 90. The solid is closed with a straight taper to zero chroma at black and white.
  That part is an extrapolation, not data. It holds 2.4 % of the volume, and leaving it out moves the Vallejo
  figure below by 0.1 points.
- Outside sRGB, the surface shows the sRGB color of the same L and h with the chroma reduced until it fits.
  Hovering it shows the real value and says it is outside sRGB; clicking there picks nothing.

**The paint hull** is the convex hull of the shown paints in OKLab: the smallest convex solid that contains them.
It is drawn once at least 5 paints are shown. Its faces are flat in OKLab and split into cells of 0.03 so every
point shows its own color. Where a cut goes through it, a dashed line traces its outline. A convex hull is a
measure of spread, not a claim that every color inside it can be mixed from the paints. Light mixes linearly in
CIE XYZ and linear RGB, where a hull would be exactly the reachable mixes, but paint does not mix linearly in
any three-number color space: the result depends on the pigments' spectra (Kubelka–Munk theory).

**Coverage.** The line under the solid gives the share of the color space's volume that the hull covers, and in
Pointer's mode the share sRGB covers. Volumes are measured in OKLab, so equal volumes are equal perceptual
extents. `src/color/coverage.ts` computes them on a grid:

1. OKLab (L 0 to 1, a and b within ±0.34) is split into cubes 0.01 on a side, about 460 000 of them.
2. The centers inside the gamut stand for its volume: about 49 000 for Pointer's gamut, 54 000 for sRGB. A center
   is inside Pointer's gamut when, converted to CIELAB under illuminant C, its chroma is at most the table's
   maximum for its L\* and hue.
3. The coverage is the fraction of those centers that also lie inside the hull, that is on the inner side of
   every face plane. Parts of the hull outside the gamut do not count.

A four times finer grid moves the figures by less than 0.05 points. `colorSetCoverage(colors, gamut)` does all of
it for a list of OKLab colors, and `scripts/coverage.js` for a file of hex colors (Node 22.18 or later):

```sh
node scripts/coverage.js data/vallejo.json
```

It prints the coverage of Pointer's gamut and of sRGB for all colors, for each `range` and `type`, and for all
colors except each group of a field with more than two values. Colors come from `cielab` when present, else
`rgb`, as on the page. It also takes a JSON array of `"#rrggbb"` strings, so other paint ranges can be compared
the same way. The table below comes from it.

| Paints shown | Color from | Share of Pointer's gamut covered by their hull |
|---|---|---|
| Game Color and Model Color charts (302) | `cielab` | 46 % |
| Game Color chart (108) | `cielab` | 46 % |
| Model Color chart (194) | `cielab` | 30 % |
| Squidmar Color (72) | `rgb` | 50 % |
| All paints (374) | both | 57 % |
| *sRGB itself, for comparison* | | *78 %* |

The chart figures describe the printed charts. They are lower than the 52 % the sRGB hex values give, because the
hex conversion made two errors that pulled in opposite directions. It clipped the ten printed colors outside sRGB
to its edge, which lowered the figure. Its black point compensation stretched the chart's darkest print (L\* 9.9)
down to pure black and every dark color with it, which inflated the hull more. What remains is mostly a gap among
dark colors: CMYK cannot print dark saturated colors, so the charts say little about how far dark paints reach.

The Squidmar figure is not comparable. Its colors are sampled from marketing images, which are made for screens,
with pure black and possibly boosted saturation, so its 50 % and the 57 % for all paints overstate what the data
supports. [Findings: paint data and Pointer's gamut](#findings-paint-data-and-pointers-gamut) has the details and
the sources.

Page layout, by width:

| Width | Layout |
|---|---|
| Views area ≥ 1040 px | Paints on the left, the three views side by side |
| Views area 640–1039 px | Paints on the left, B.1 and B.2 side by side, A full width below them |
| Page < 900 px | One column: readout, paints, views |

The views switch on the width of their own area (a container query), not the window, because the paints pane
takes a share of it.

## How it works

- **Color math** (`src/color/oklab.ts`): the sRGB transfer function, Ottosson's matrices, and OKLab ↔ OKLCh. A
  color is in gamut when its linear sRGB channels are within [0, 1] ± 1e-6. `maxChroma(L, h)` finds the gamut
  boundary by bisection, and a unit test brute-forces the assumption behind it (that along every constant-L,
  constant-h ray the in-gamut chroma is one interval). `findCusp(h)` finds the lightness of maximum chroma.
- **Slices** (`src/views/slicePlot.ts`): each slice is a plane `lab = origin + x·ex + y·ey` with an orthonormal
  basis. Every pixel is converted independently, so the gamut boundary is exact at pixel resolution. Picking,
  hover markers and "is this color on the plane" checks all use the same basis.
- **Solid** (`src/views/gamutSolid.ts`): the six faces of the RGB cube, each a 64 × 64 grid sampled uniformly in
  gamma-encoded sRGB (which spreads vertices evenly in L), are mapped to OKLab (x = a, y = L, z = −b). Pointer's
  gamut is a grid on its own table, every 1 L\* and 2° of CIELAB hue. The material is unlit, so each surface
  point shows exactly its own color. Instead of shading, the cut faces get outlines. The cuts use three.js
  clipping planes, and the caps are the slice textures, themselves clipped in wedge mode.
  The wireframe cage traces the gamut boundary along OKLCh lines, so it matches the slices: rings every 0.1 L
  (what B.1 outlines), meridians every 30° of hue (what B.2 outlines), plus for sRGB the 12 edges of the RGB
  cube, which are the solid's creases. Each vertex has its own color. Pointer's boundary on an OKLCh line is
  found by bisection, like sRGB's; a unit test checks that each constant-L, constant-h ray leaves it once.
- **Hull** (`src/color/hull.ts`): built incrementally. Each point outside the current hull removes the faces it
  can see and is joined to their horizon, which is instant for a few hundred paints. The same face planes give
  the inside test that coverage uses.

Two details of the sRGB gamut in OKLab turned up while building this. Both are handled and covered by tests.

1. **The gamut is slightly concave next to the blue primary.** On the ray from gray to `#0000ff` at constant L
   and h, the red channel dips to about −0.0007 and returns to 0 exactly at the primary. So the constant-hue
   boundary leaves the gamut at C ≈ 0.266 and only touches pure blue (C 0.313) at its tip. The cusp at the blue
   primary's own hue (264.05°) is therefore at L 0.49, C 0.288, not at pure blue.
2. **All pure blues share one hue.** `(0, 0, t)` maps to `t^⅓ · lab(blue)`, so the blue–black edge is a
   straight line at h = 264.05°. A gamut tolerance of 1e-4 made that edge appear as a phantom sliver in the
   h = 264° slice. The tolerance is now 1e-6, which only absorbs float error.

```
src/
  color/oklab.ts          conversions, gamut test, max chroma, cusp, nearest screen color
  color/oklab.test.ts
  color/cielab.ts         CIELAB relative to illuminant C or D50 <-> OKLab
  color/cielab.test.ts
  color/pointer.ts        Pointer's gamut: the table, inside test, boundary
  color/pointer.test.ts
  color/hull.ts           3D convex hull, inside test, volume
  color/hull.test.ts
  color/coverage.ts       share of a gamut's OKLab volume inside a hull
  color/coverage.test.ts
  paints/record.ts        which field gives a paint's color: cielab, else rgb (shared with the scripts)
  paints/vallejo.ts       Vallejo paints and layouts from data/ (plus All paints), with OKLab from the best field
  paints/vallejo.test.ts  every layout code resolves, every paint has a webhex, OKLab agrees with the stored OKLCh
  paints/kimera.test.ts   data/kimera.json: 13 colors, a pigment and webhex each, stand-ins named, OKLCh agrees
  state.ts                tiny observable store (L, h, picked color and paint, shown paints, hover, cut, shapes)
  theme.ts                reads CSS tokens so canvas drawing follows light/dark
  views/slicePlot.ts      shared 2D slice renderer, markers, pointer handling
  views/lightnessSlice.ts B.1
  views/hueSlice.ts       B.2
  views/gamutSolid.ts     A (three.js): the color space, the paint hull, coverage
  views/swatchPane.ts     Vallejo swatches, the layout select, and which paints are shown
  main.ts                 wiring, layout, tooltip, readout
```

## Known limits

- **sRGB only.** Display P3 screens can show more. Supporting P3 means swapping the RGB ↔ LMS matrices and
  adding a gamut toggle.
- **OKLab distance is Euclidean.** That works well for small and medium differences. Perceived difference has
  diminishing returns for large ones (Bujack et al., PNAS 2022), so large distances here overstate how different
  two colors look.
- **No viewing conditions.** Surround, adaptation and display luminance are not modeled. CAM16-UCS would add them
  at the cost of more parameters.
- **Paint colors are not measurements.** Game Color and Model Color come from Vallejo's printed charts, so their
  hull says how the charts spread, not how far real paint reaches. The charts are limited to what CMYK inks can
  print, which is weakest for dark saturated colors, and Vallejo notes that printed colors are only approximate.
  Squidmar Color comes from marketing images. No published measurements of dried paint were found for the current
  ranges. Measured CIELAB or spectral data would go into `cielab` and be used as it is. See
  [Findings: paint data and Pointer's gamut](#findings-paint-data-and-pointers-gamut).

## Data

### `data/vallejo.json`

Vallejo **Game Color** and **Model Color** paints from the current ranges (new
Game Color 2023, new Model Color 2024), excluding metallics, and the whole
**Squidmar Color** range (made by Vallejo), including its metallics.

| range          | type          | count |
| -------------- | ------------- | ----- |
| Game Color     | `acrylic`     | 80    |
| Game Color     | `ink`         | 12    |
| Game Color     | `wash`        | 8     |
| Game Color     | `fluorescent` | 8     |
| Model Color    | `acrylic`     | 192   |
| Model Color    | `ink`         | 2     |
| Squidmar Color | `acrylic`     | 48    |
| Squidmar Color | `metallic`    | 7     |
| Squidmar Color | `fluorescent` | 5     |
| Squidmar Color | `ink`         | 12    |

Not included: Game Color and Model Color metallics, Game Color Special FX
(textured effects without a single flat color), Model Color Liquid Metal,
Xpress Color, and mediums/varnishes.

Colors are keyed by code, one color per line:

```js
import vallejo from './data/vallejo.json' with { type: 'json' };

vallejo['70.995'];
// {
//   code: '70.995', name: 'German Grey', range: 'Model Color', type: 'acrylic',
//   rgb: '#2E2E2C', webhex: '#2E2E2C', cmyk: { c: 70, m: 60, y: 60, k: 70 },
//   cielab: { l: 23.21, a: -0.47, b: 1.05 },
//   oklch: { l: 0.3377, c: 0.0031, h: 116.42 }
// }
```

- `rgb`: `#RRGGBB`. For the charts, the print color as a screen shows it: clipped
  to sRGB, with the darkest print stretched to black. For Squidmar Color, sampled
  from its images.
- `webhex`: `#RRGGBB`, the color the manufacturer shows for the paint on its
  website, for comparing with other brands, most of which only publish that.
  For Game Color and Model Color, the flat color band in each product image on
  Vallejo's website. For Squidmar Color, the same value as `rgb`: its images are
  what the manufacturer shows on the web.
- `cmyk`: Vallejo's own print values from the chart, in percent; `null` for
  Squidmar Color, which has no published chart
- `cielab`: CIELAB relative to D50 (2° observer), `l`, `a`, `b`. For the charts,
  the print CMYK converted through the chart's own ICC profile: the printed
  color, not limited to sRGB. `null` for Squidmar Color, which has no such data.
  Measured values of dried paint would go here too.
- `oklch`: computed by `scripts/add-oklch.js` from `cielab` when present, else
  from `rgb`; `l` (0–1), `c`, `h` (degrees, `null` for achromatic colors)

The page and the scripts take a paint's color from `cielab` when it has one, else
from `rgb` (`src/paints/record.ts`). `cmyk` only means something together with the
chart's ICC profile, so the extractor turns it into `cielab`. Nothing reads
`webhex` yet.

To recompute `oklch` after changing `rgb` values (Node 22.18 or later, which
runs the TypeScript import directly):

```sh
node scripts/add-oklch.js data/vallejo.json
```

### `data/vallejo-layouts.json`

The order the colors are printed in, as rows of codes. Every code is a key in
`vallejo.json`.

| key                       | contents                                              |
| ------------------------- | ----------------------------------------------------- |
| `gameColor`               | Game Color chart: main chart, Wash, Fluo, Ink         |
| `modelColor`              | Model Color chart (its two inks sit in the main grid) |
| `gameColorCombinations`   | 32 Highlight / Base / Shadow triplets in 3 blocks     |
| `modelColorCombinations`  | 68 Highlight / Base / Shadow triplets in 4 blocks     |
| `squidmarColorMegaSet`    | Squidmar Color Mega Set: all 72 paints                |
| `squidmarColorEssentials` | Squidmar Color Essentials: 30 of the 72               |

Each layout has `sections`, and each section has `rows`, an array of arrays of
codes. In the charts a row is one printed row of swatches, and sections carry
the chart heading as `title`. The Squidmar images have no headings: each of
their sections is one panel of the image, with no `title`. In the combinations
each row is one `[highlight, base, shadow]` triplet (named by the layout's
`columns`), and each section is one printed block.

```js
import layouts from './data/vallejo-layouts.json' with { type: 'json' };

layouts.gameColor.sections[0].rows[0];
// ['72.001', '72.101', '72.098', '72.034', '72.003', '72.100', '72.107', '72.108', '72.099']

layouts.gameColorCombinations.sections[0].rows[0].map((code) => vallejo[code].name);
// ['Dead White', 'Off-White', 'Elfic Flesh']
```

### Source

Vallejo's official color charts:

- [CC266 Game Color & Xpress Color, Rev. 03 (September 2025)](https://acrylicosvallejo.com/wp-content/uploads/2025/09/CC266-Game_Color.pdf)
- [CC329 Model Color, Rev. 00 (March 2024)](https://acrylicosvallejo.com/wp-content/uploads/2024/03/CC329-R00-Model-Color-NewIC.pdf)

The charts store each swatch as print CMYK (for Coated FOGRA39).
`scripts/extract_vallejo.py` reads those values, the chart rows and the
combination tables from the PDFs, and converts the CMYK through the charts'
embedded Coated FOGRA39 ICC profile twice:

- to `cielab` with relative colorimetric intent (paper white = L\* 100) and no
  black point compensation, so the darkest print keeps its own L\* 9.9. It runs
  LittleCMS in double precision (`scripts/lcms.py`), using the system library or
  the copy bundled with Pillow.
- to `rgb` with relative colorimetric intent and black point compensation, the
  Adobe default for displaying CMYK documents, through Pillow's 8-bit
  transform. That transform works from a precomputed table, which is least
  accurate next to the sRGB edge: for some saturated yellows it is up to 9
  units per channel off an exact conversion.

Names are taken from the chart labels, with truncated words spelled out
(`Cam.` → `Camouflage`, `Unif.` → `Uniform`, …).

Squidmar Color has no published chart. Its source is the announcement images
of its two sets, in `data/sources/`: the Mega Set (all 72 paints, headed "72
New Paints") and the Essentials (30 of them, headed "30 New Paints").
`scripts/extract_squidmar.py` finds each brush-stroke swatch and takes its
dominant fill color, ignoring the printed code, the stroke's edges and the
background. The colors come from the Mega Set image. The Essentials image is
sampled as a cross-check: its 30 paints agree with the Mega Set values within
5 RGB units per channel (mean ΔE2000 0.6). Metallics are drawn as gradients,
so their `rgb` is the gradient's dominant mid-tone. Names are transcribed from
the images, with `Fluoresc` spelled out as `Fluorescent`.

The `webhex` of Game Color and Model Color comes from Vallejo's website, which
gives no color value as text or CSS. Each product page shows one image: the
bottle, and behind it, in the top left corner, a band in the paint's color
with a diagonal edge. `scripts/extract_vallejo_webhex.py` downloads the images
from the site's uploads folder (the pages themselves sit behind a bot check)
and takes the band's color. On every image except the washes' the band is one
flat color. On a wash's image it fades from the color at its bottom left corner
to white, and `webhex` is that corner's color. The images are sRGB, so the
pixel values are what a browser shows. The script stops if a band is not flat,
if an image is not sRGB, or if a color is more than 16 units per channel from
the chart's `rgb`, which would mean the image shows another paint. These colors
turn out to be the chart CMYK converted for display; see
[Findings](#vallejos-web-colors-are-the-chart-converted-for-display).

Each extractor replaces only its own colors and layouts, so any of them can be
re-run on its own, and a re-run keeps `webhex`. Layouts keep their place in the
file, so to build it from nothing, run them in this order (the `webhex` script
compares with `rgb`, so it runs after the chart extractor):

```sh
pip install -r scripts/requirements.txt
python scripts/extract_vallejo.py game.pdf model.pdf data   # PDFs: see the script
python scripts/extract_squidmar.py data/sources/squidmar-mega-set.webp \
  data/sources/squidmar-essentials.webp data
python scripts/extract_vallejo_webhex.py data
node scripts/add-oklch.js data/vallejo.json
```

The chart values describe the printed chart, not a measurement of dried paint.
Vallejo notes that printed chart colors are only approximate. The Squidmar
values are one step further removed: they are the colors of a compressed
marketing image.

### `data/kimera.json`

The **Kimera Kolors** Pure Pigments Base Set (Kimera Models, sold through
Pegaso World, made by Camerini & Co): 13 acrylics with one pigment each and no
white. The set's satin medium has no color and is left out. They have no
product codes, so the file is keyed by name. The page does not show them yet;
`scripts/coverage.js` reads the file.

| name | pigment | `webhex` | `cielab` (D50) | `cielab` stand-in |
| --- | --- | --- | --- | --- |
| The White | PW6 | `#F6F5F4` | 96.3 / −0.5 / 0.9 | Golden Matte Fluid Titanium White, Okumura 2005 |
| Carbon Black | PBk7 | `#252223` | 26.1 / 0.2 / −0.2 | Golden Matte Fluid Carbon Black, Okumura 2005 |
| The Red | PR170 | `#D93634` | — | none found |
| Orange | PO34 | `#DE573D` | — | none found |
| Warm Yellow | PY83 | `#F1AE22` | 78.5 / 29.0 / 88.8 | Golden Matte Fluid Diarylide Yellow, Okumura 2005 |
| Cold Yellow | PY151 | `#FDDD18` | — | none found |
| Phthalo Blue (red shade) | PB15:2 | `#292D67` | 23.6 / 5.3 / −10.4 | Golden Heavy Body Phthalo Blue (Red Shade), PB15:0, Golden 2014 |
| Phthalo Blue (green shade) | PB15:4 | `#283676` | 23.1 / 9.7 / −21.8 | Golden Matte Fluid Phthalo Blue (Green Shade), Okumura 2005 |
| Magenta | PR122 | `#A12238` | 30.6 / 29.8 / 4.3 | Golden Matte Fluid Quinacridone Magenta, Okumura 2005 |
| Phthalo Green | PG7 | `#1B4044` | 25.3 / −4.6 / −7.4 | Golden Matte Fluid Phthalo Green (Blue Shade), Okumura 2005 |
| Violet | PV23 | `#3D2E2A` | 23.9 / 2.9 / 0.2 | Golden Matte Fluid Dioxazine Purple, Okumura 2005 |
| Red Oxide | PR101 | `#913A2E` | 39.0 / 33.9 / 25.5 | Golden Matte Fluid Red Oxide, Okumura 2005 |
| Yellow Oxide | PY42 | `#EBA91B` | 64.8 / 14.0 / 48.4 | Golden Heavy Body Yellow Oxide, Golden 2014 |

The fields are those of `data/vallejo.json`, without `code`, plus two:

- `pigment`: the Colour Index name, from the list on the base set's page in
  the maker's shop.
- `webhex` (and `rgb`, the same value): the color the maker's own chart shows.
  The shop gives no color value as text or CSS, and its product photos show
  the paint through the translucent bottle, lighter and bluer than the chart
  (Carbon Black reads `#384455` there), so they are not used. The chart
  ("Kimera Kolors Charts" on the maker's resources page) is scans of
  hand-painted swatches, each a square that goes from the paint at full
  strength to a thin wash. `webhex` is the full-strength top of the square,
  converted from the chart's CMYK the way Vallejo's web colors are made from
  its chart (relative colorimetric with black point compensation). The chart
  is printed for uncoated paper, which cannot show dark saturated colors:
  Violet comes out near-black brown, though its tints with white are plainly
  violet. The White is white on white paper, so its value is the paper's.
- `cmyk`: `null`.
- `cielab`: a **stand-in**, not a measurement of the Kimera paint. No
  published measurement of Kimera Kolors was found. A pigment has no single
  color: its grade, particle size, binder, concentration and the film's
  thickness all change it. So `cielab` is the measured full-strength film of a
  Golden acrylic with the same pigment (for PB15:2, the nearest one, PB15:0),
  computed from its reflectance spectrum for D50 and the 2° observer (ASTM
  E308). `null` for The Red (PR170), Orange (PO34) and Cold Yellow (PY151),
  which no usable dataset covers.
- `cielabSource`: the stand-in paint and its dataset.
- `oklch`: from `cielab` when present, else from `rgb`, as for Vallejo.

The pigment list and the chart disagree twice, and the shop's list is used: the
chart prints Warm Yellow as PY85 (the shop names Diarylide Yellow HR, which is
PY83) and Red Oxide as PR130 (the shop: "PR101 (130)", probably the Bayferrox
130 grade).

The stand-in spectra are in `data/sources/pigment-spectra.json`, taken by
`scripts/extract_pigment_spectra.py` from two datasets of Golden acrylics,
whose pigments Golden publishes:

- Y. Okumura, "Developing a spectral and colorimetric database of artist paint
  materials", MS thesis, RIT Munsell Color Science Laboratory (2005), data at
  [rit-mcsl.org](https://www.rit-mcsl.org/StudentResearch/paint_research.zip):
  Golden Matte Fluid Acrylics drawn down thick enough to hide, unvarnished,
  measured with specular excluded, 360–750 nm. Eight of the pigments.
- Golden Heavy Body Acrylics, 10 mil drawdowns over white (2014), from
  [realtimerendering.com](https://www.realtimerendering.com/golden.html), now
  only on the Wayback Machine: 400–700 nm. The white card shows through the
  more transparent colors, Golden notes. Yellow Oxide and Phthalo Blue (Red
  Shade), which the thesis lacks.

The same integration reproduces the CIELAB that Golden's file gives for all its
78 paints within 0.06, and the thesis's masstone of Carbon Black (L\* 26.1).
The six pigments both datasets have agree within 0.6–3.5 ΔE\*ab. Other
sources were checked and not used (September 2026):

- The CHSOS Pigments Checker has PR170 and PY151, but in thin films (its
  phthalo green is L\* 66), and its two spectrometers differ by 15–20 in b\*
  on the same swatches.
- handprint.com has watercolors only.
- The pigment data sheets checked (Lanxess Bayferrox 130, Kronos, Orion carbon
  blacks) give only differences from the maker's own standard.
- artistpigments.org lists 33 Kimera Kolors, 13 of them with measured CIELAB
  (D50, 2°). Measurements of these paints would replace the stand-ins, but the
  site sits behind a bot check that the scripts cannot pass, so which 13 is not
  known here.

To rebuild (Node 22.18 or later for the last step):

```sh
pip install -r scripts/requirements.txt
python scripts/extract_pigment_spectra.py paint_research.zip GoldenSpectra.zip data/sources  # downloads: see the script
python scripts/extract_kimera.py kolors-charts.pdf data                                      # chart: see the script
node scripts/add-oklch.js data/kimera.json
```

The stand-ins are opaque films, and the transparent pigments (the phthalos,
Magenta, Violet) are nearly black that way: a thin layer over a light primer,
or a mix with white, is far lighter and more colorful. So the hull of the 13
paints says little about a set meant for mixing. It covers 12.5 % of Pointer's
gamut from the best source of each paint (10 stand-ins, 3 web colors), and
17.2 % from `webhex` alone.

## Findings: paint data and Pointer's gamut

A record of the work on "how much of Pointer's gamut do Vallejo's paints cover" (September 2026): what the answer
is, what went wrong on the way, what the data does now, and why it is still not ideal. Figures from
`scripts/coverage.js` can be regenerated. Figures marked *one-off* were measured once with throwaway scripts, most
of them needing the chart PDFs and their ICC profile, which are not in the repository.

### The answer so far

The hull of the Game Color and Model Color charts covers **46 %** of Pointer's gamut, measured by volume in
OKLab. For scale:

| Gamut | Share of Pointer's gamut |
|---|---|
| sRGB | 78 % |
| FOGRA39, the press the charts are printed for | at most 60 %, probably nearer 55 % (*one-off*) |
| Game Color and Model Color charts | 46 % |

The press figure is the hull of an 11-step CMYK grid within the 330 % ink limit, converted like `cielab`. A hull
overstates a gamut that is not convex: the same method gives 84 % for sRGB instead of 78 %. So the charts already
show most of what print can show, and the figure measures the printed charts, not the paint.

### Where the colors come from, and what each step loses

```
dried paint                  no published measurements of the current ranges
  │ Vallejo picks CMYK        limited to what the press prints, and only an imitation
  ▼
printed chart: cmyk
  ├─ profile, relative colorimetric, float          → cielab   exact, not limited to sRGB (the page uses this)
  ├─ profile + black point compensation, 8-bit      → rgb      clipped to sRGB, darks stretched (kept, unused for the charts)
  └─ Vallejo: the same, exact, shown on its website → webhex   like rgb, without the 8-bit error (for comparing brands)
      ▼
OKLab                          exact, no limit: a coordinate system, not a device
```

### Vallejo's web colors are the chart converted for display

Most paint makers publish only an sRGB color on their websites, so comparing brands means comparing those, and
`webhex` holds them. Vallejo's are not a separate source. An exact conversion of the chart CMYK to sRGB, relative
colorimetric with black point compensation (the settings of `rgb`, in double precision through LittleCMS), matches
the flat band of all 294 non-wash paints within 3 units per channel, and 222 of them within 1. Without black point
compensation it misses by up to 29 (*one-off*). So:

- `webhex` is within 2 units of `rgb` for 265 of the 294, and further only where Pillow's 8-bit conversion of `rgb`
  is off, by up to 14 (72.122 Bile Green). The eight washes, read from the corner of a gradient, are within 5.
- `webhex` has both errors of the hex (problems 1 and 2 below): the printed colors outside sRGB are clipped, and the
  darks are stretched, so both blacks (72.051 and the 72.094 ink) are `#000000`. Its coverage is that of the old
  hex, not of the printed colors:

  | Paints | from `cielab` (the page) | from `rgb` | from `webhex` |
  |---|---|---|---|
  | Game Color and Model Color charts (302) | 45.7 % | 52.2 % | 52.6 % |
  | Game Color (108) | 45.5 % | 51.9 % | 52.2 % |
  | Model Color (194) | 30.2 % | 34.0 % | 34.1 % |
  | All paints (374) | 56.9 % | 58.6 % | 59.0 % |

  The `rgb` and `webhex` columns are *one-off*: `scripts/coverage.js` on a copy of the data without `cielab`, and
  for `webhex` with it in place of `rgb`. Squidmar Color is 49.7 % in every column.
- Figures from web colors compare brands on equal terms only as far as their web colors are made the same way.
  How other brands make theirs is not known.

### Problems we hit, and what we did

1. **The hex was the only color.** The data first stored each chart color as an sRGB hex, and everything was
   computed from it. A hex can only hold sRGB colors, and ten printed colors lie outside sRGB: 70.808 Blue Green,
   70.838 Emerald, 70.840 Light Turquoise, 70.841 Andrea Blue, 72.023 Electric Blue, 72.119 Aquamarine,
   72.160 Fluorescent Blue, 72.161 Fluorescent Cold Green, 73.208 Yellow (wash), and 72.101 Off-White (only
   just). The conversion clipped them to sRGB's edge. OKLab was never the limit; it just never received the
   real values. *Fix:* the extractor also stores `cielab`, converted straight from the CMYK, and the page and the
   scripts use it before `rgb`.
2. **Black point compensation inflated the coverage.** The hex conversion used it, as displays do: it stretches
   the press's darkest print (L\* 9.9) to pure black and pulls every dark color down with it. That puts the hull
   into dark saturated colors the chart never shows. An early estimate from CIELAB made with the same setting
   gave 59 %, which was wrong for the same reason. *Fix:* `cielab` is converted without it. Black point
   compensation is for showing a print on a screen, not for measuring what was printed. By lightness
   (*one-off*):

   | Chart colors as | L\* 15–30 (11.5 % of Pointer's volume) | L\* 30–90 (86 %) | All |
   |---|---|---|---|
   | sRGB hex (before) | 50.9 % | 52.2 % | 52.2 % |
   | CIELAB with black point compensation | 60.3 % | 58.6 % | 58.9 % |
   | CIELAB without it (now) | 24.3 % | 49.1 % | 45.7 % |

   The two errors of the hex pulled in opposite directions, and the inflation was the larger one.
3. **The 8-bit conversion is least accurate where it matters.** Pillow converts through a precomputed table. Next
   to the sRGB edge it is up to 9 units per channel off an exact conversion (70.952 Lemon Yellow,
   70.915 Deep Yellow), and colors just outside sRGB are not cleanly clipped (72.122 Bile Green's blue channel came
   out 14 where an exact conversion with the same settings gives 0). *Fix:* `cielab` is computed in double
   precision by LittleCMS (`scripts/lcms.py`). `rgb` is kept as it was.
4. **Squidmar Color has no chart.** Its colors are sampled from marketing images, which are made for screens, with
   pure black and possibly boosted saturation. Its 72 colors alone cover 50 %, more than both charts together, so
   figures that include it are not comparable. *What we did:* nothing to the data; it has no `cielab`, and the
   README says so wherever its figures appear.
5. **"Covered" is not "mixable".** Light mixes linearly in CIE XYZ and linear RGB, so a hull there is exactly the
   set of optical mixes; built there, the charts' hull covers 46.8 % instead of 45.7 % (*one-off*), so the choice
   of space barely matters. Paint does not mix linearly in any three-number color space: the result depends on
   the pigments' spectra (Kubelka–Munk theory), and two paints that look the same can mix differently with a third.
   *What we did:* the hull is documented as a measure of spread only.

### Why it is still not ideal

- **The chart imitates the paint.** Vallejo chose CMYK values to look like each paint on press. Paint beyond the
  press gamut was approximated, fluorescents cannot fluoresce in print, and Vallejo notes that printed colors are
  only approximate.
- **The dark end is uncertain both ways.** Print is weakest for dark saturated colors (the charts cover 24 % of
  Pointer's gamut between L\* 15 and 30), so dark paints may reach further than the charts show. But the chart's
  black is L\* 9.9, while a 2019 spectrophotometer measurement of the old Game Color Black gave about L\* 23:
  matt paint blacks are lighter than printed ones.
- **The conversion settings are choices.** Relative colorimetric intent makes the paper L\* 100, a perfect white
  that no white paint is. Absolute colorimetric would keep the paper at its own L\* of about 95.
- **Pointer's gamut is only known between L\* 15 and 90.** The taper to black and white is an extrapolation (2.4 %
  of the volume), and the table is interpolated between its 10° and 5-unit steps.
- **The measure is a choice too.** Volume in OKLab weighs perceptual extent evenly; volume in CIELAB gives
  somewhat different shares.

### What would fix it

Measurements of dried paint. From best to worst:

1. Spectral reflectance, 400 to 700 nm in 10 nm steps, over white and over black. It gives the color under any
   light, the opacity, and Kubelka–Munk mixing.
2. CIELAB, D50 and 2° observer, of a dried swatch, with the measurement condition stated (ISO 13655 M1, with UV,
   for fluorescents), the backing (white for washes and inks), the number of coats and the finish. Metallics
   change with angle and need more than one value.
3. Print CMYK with its ICC profile, which is what Vallejo publishes and what `cielab` is now.
4. RGB in a wide-gamut space, named. It removes the clipping but not the doubt about where the value came from.
   How much of Pointer's gamut each space can hold (*one-off*): sRGB 77.9 %, Display P3 90.7 %, Adobe RGB 92.3 %,
   Rec. 2020 99.9 %.
5. An sRGB hex, as shops publish: clipped, and usually of unknown origin. Vallejo's (`webhex`) is its print CMYK
   converted for display.

Measured CIELAB goes into `cielab` and the page uses it as it is. Without published data, a handheld
spectrophotometer (for example Nix Spectro) or colorimeter (for example Datacolor ColorReader) on drawdown cards,
painted the same way for every paint and fully dry, would do.

### Sources

- M. R. Pointer, "The gamut of real surface colours", *Color Research & Application* 5 (1980). Table as published
  by [colour-science](https://www.colour-science.org/) (`colour.models.DATA_POINTER_GAMUT_VOLUME`).
- Vallejo's charts, with the print CMYK and the embedded Coated FOGRA39 profile:
  [CC266 Game Color](https://acrylicosvallejo.com/wp-content/uploads/2025/09/CC266-Game_Color.pdf),
  [CC329 Model Color](https://acrylicosvallejo.com/wp-content/uploads/2024/03/CC329-R00-Model-Color-NewIC.pdf).
- [LittleCMS](https://www.littlecms.com/), the color engine behind the conversions.
- P. Kubelka and F. Munk, "Ein Beitrag zur Optik der Farbanstriche" (1931), the standard model of paint mixing;
  Š. Sochorová and O. Jamriška, "Practical pigment mixing for digital painting" (Mixbox), *ACM Transactions on
  Graphics* 40 (2021), a practical approximation for a fixed set of pigments.

Searched for measured Vallejo data in September 2026; nothing usable for the current ranges:

- [Oldhammer Forum, "Conversion Table Interest"](https://forum.oldhammer.org/threads/conversion-table-interest.24017/):
  spectrophotometer, D65/2°, dried opaque swatches, about 40 paints of the old (pre-2023) Game Color. Published
  only as sRGB values in posts, already clipped (Gold Yellow 255,165,0; Turquoise 0,117,139), with no dataset.
- [Britmodeller, Vallejo Air measurements](https://www.britmodeller.com/forums/index.php?%2Ftopic%2F235124742-acrylic-vallejo-air-measurements-of-full-range-of-paints%2F=):
  Model Air, a different range; the page refused access.
- [Encycolorpedia](https://encycolorpedia.com/252527): its CIELAB values are computed from hex codes, not
  measured.
- Paint matchers such as [Miniature Painting Forge](https://www.miniaturepaintingforge.com/full-comparison/) and
  [paint-comparator](https://nickryden.github.io/paint-comparator/): hex values.
- [Dan Becker's paint swatch charts](http://www.danbecker.info/minis/miniother/PaintCharts/index.html): not
  checked, the site was unavailable.

## Roadmap

### D. Color set maps (planned, not implemented)

**What it is for.** Views A and B show the whole space. D is for a *specific set of colors*, and for comparing
several sets with each other: a palette, a paint set, brand colors, or colors extracted from an image. The
questions it should answer at a glance:

- Which colors in this set are near-duplicates, and which pairs are clearly distinct?
- Where are the gaps? Is the set evenly spread, or clumped?
- How do two sets relate? Which colors of set A have no close match in set B? Which set covers more of the space?

**Why it needs its own view.** The colors of a set are scattered through 3D, so no single slice contains them.
Projecting them onto one plane (for example a top-down a/b view) throws away one dimension: black and white
land on the same spot. D instead builds a 2D map from the *pairwise perceptual distances* themselves, using
**metric multidimensional scaling (MDS)**. MDS places points so that the distance between any two on the map
matches their ΔE as closely as possible. For a set of colors this is the only 2D layout that directly means
"distance = perceived difference". The price: axes have no meaning, some error is unavoidable, and adding a
color can change the layout.

Alternatives, and why not:

- **PCA / classical MDS alone.** OKLab distances are Euclidean, so classical (Torgerson) MDS gives exactly the
  PCA projection: the best *linear* flattening. It is a good starting point, but it can't bend. Metric MDS
  (stress minimization) can trade a little global accuracy for much better local accuracy, and it also accepts
  non-Euclidean metrics such as CIEDE2000. Classical MDS is used as the initialization.
- **t-SNE / UMAP.** These keep near neighbors together and discard large distances, so cluster sizes and the gaps
  between clusters mean nothing. That is the opposite of what D is for.
- **Self-organizing maps / grids.** They look like maps, but their distances are not metric.

**How to implement it.**

1. **Input.** A text area per set that accepts hex, `rgb()`, `hsl()` and `oklch()` values, one per line, with an
   optional name. Several named sets. Later: extract a palette from an image with k-means in OKLab.
2. **Distance.** ΔE<sub>OK</sub> by default: fast, and consistent with views A and B. CIEDE2000 as an option: it is
   more accurate for small differences and non-Euclidean, which is where MDS helps most. An optional lightness
   weight k<sub>L</sub> for users who care more about value than hue.
3. **Algorithm.** Initialize with classical MDS (double-center the squared distance matrix, take the top two
   eigenvectors by power iteration). Then run **SMACOF** (the Guttman transform) to minimize the weighted stress
   Σ w<sub>ij</sub> (d<sub>ij</sub> − δ<sub>ij</sub>)². w = 1 favors getting large distances right, and
   w = δ⁻² (Sammon-like) favors small ones. Offer both, because "near-duplicate detection" needs the second.
   Stop when relative stress change < 1e-6 or after 300 iterations. Cost is O(n²) per iteration: fine on the
   main thread up to about 200 colors, and in a Web Worker beyond that.
4. **Orientation.** MDS is only defined up to rotation, reflection and translation. Align the result with
   Procrustes to the colors' (a, b) coordinates, so similar sets produce similar-looking maps and hue direction
   stays roughly familiar.
5. **Multiple sets.** Embed the *union* of all sets in one joint map. That is the only way distances *between*
   sets are meaningful. Sets differ by marker outline or shape, and each can be toggled. Separate per-set maps
   aligned with Procrustes are useful side by side, but distances across them mean nothing, and the UI must say
   so.
6. **Stability.** When a color is added or edited, warm-start SMACOF from the previous layout, with the new point
   placed at the distance-weighted average of its nearest neighbors. The map then shifts a little instead of
   reshuffling.
7. **Honesty indicators.** Show Kruskal stress-1 as a number. Add a Shepard diagram (map distance against ΔE for
   every pair). Mark each point's own error, for example as ring thickness. A toggle draws lines between the
   worst-represented pairs. Users should see where the map lies.
8. **Value-locked variant.** Fix y = L and optimize only x. Lightness then reads directly, which artists care
   about most, at the cost of higher stress.
9. **Numbers next to the map.**
   - Within a set: nearest pairs sorted by ΔE with JND multiples, flagging anything under 2 JND as a
     near-duplicate.
   - Between sets: each color's nearest match in the other set; the worst of those (Hausdorff distance) and the
     average (Chamfer distance); for equal-size palettes, the optimal one-to-one matching (Hungarian algorithm).
   - Coverage: convex-hull volume in OKLab, plus L range and chroma range. The hull and the volume-share
     measure already exist (`src/color/hull.ts`, `src/color/coverage.ts`).
10. **Links to A and B.** Draw set colors as points in the 3D solid. In B.1 and B.2, show points within a thin band
   around the slice plane, faded by their distance from it.

Planned files:

```
src/sets/parse.ts     color string parsing (hex, rgb(), hsl(), oklch())
src/sets/distance.ts  ΔE_OK, CIEDE2000
src/sets/mds.ts       classical MDS + SMACOF, pure functions, worker-friendly
src/sets/metrics.ts   nearest pairs, Hausdorff/Chamfer, Hungarian matching, hull volume
src/views/setMap.ts   the 2D map, Shepard diagram
```

Tests to write first:

- Points on a line embed on a line with stress ≈ 0.
- A random 2D configuration is recovered up to rotation (Procrustes residual < 1e-6).
- An equilateral triangle stays equilateral.
- CIEDE2000 matches the Sharma, Wu & Dalal (2005) reference data.

Open questions before building D:

- Default metric: ΔE<sub>OK</sub> or CIEDE2000?
- Typical set size?
- Input formats: are pasted strings enough, or is image extraction needed early?

### Smaller next steps

- Plot a pasted list of colors in views A and B (a small first slice of D, useful on its own).
- Display P3 gamut toggle.
- Deep-link the current L, h and picked color in the URL.
