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
measure of spread, not a claim that every color inside it can be mixed from the paints.

**Coverage.** The line under the solid gives the share of the color space's volume that the hull covers, and in
Pointer's mode the share sRGB covers. Volumes are measured in OKLab, so equal volumes are equal perceptual
extents. They are sums over a grid of cells 0.01 on a side (`src/color/coverage.ts`); a four times finer grid
moves the figures by less than 0.05 points.

| Paints shown | Share of Pointer's gamut covered by their hull |
|---|---|
| All paints (302) | 52 % |
| Game Color chart (108) | 52 % |
| Model Color chart (194) | 34 % |
| All paints, without the 8 fluorescents | 47 % |
| All paints, acrylics only (no washes, inks or fluorescents) | 42 % |
| *sRGB itself, for comparison* | *78 %* |

Measured by CIELAB volume instead, all paints cover 52.5 % and sRGB 75 %. The hull of all paints has 26 corners,
and 13 of them are washes, inks and fluorescents. Adding the Model Color chart to the Game Color chart raises the
figure by 0.3 points. Because the paint colors come from a printed chart converted to sRGB, their hull cannot
cover much more than sRGB does.

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
  color/oklab.ts          conversions, gamut test, max chroma, cusp
  color/oklab.test.ts
  color/pointer.ts        Pointer's gamut: the table, CIELAB (C) <-> OKLab, inside test, boundary
  color/pointer.test.ts
  color/hull.ts           3D convex hull, inside test, volume
  color/hull.test.ts
  color/coverage.ts       share of a gamut's OKLab volume inside a hull
  color/coverage.test.ts
  paints/vallejo.ts       Vallejo paints and layouts from data/ (plus All paints), with OKLab computed from the hex
  paints/vallejo.test.ts  every layout code resolves, OKLab agrees with the stored OKLCh
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
- **Paint coverage is bounded by the data.** The paint colors are Vallejo's printed chart converted to sRGB, so
  their hull says how the chart spreads, not how far real paint reaches. Pointer's gamut reaches past sRGB (22 %
  of its volume), so real paints can too; showing that would need measured Lab data of the paints.

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
//   rgb: '#2E2E2C', cmyk: { c: 70, m: 60, y: 60, k: 70 },
//   oklch: { l: 0.3004, c: 0.0035, h: 106.61 }
// }
```

- `rgb`: `#RRGGBB`
- `cmyk`: Vallejo's own print values from the chart, in percent; `null` for
  Squidmar Color, which has no published chart
- `oklch`: computed from `rgb` by `hexToOklch` in `src/color/oklab.ts`; `l`
  (0–1), `c`, `h` (degrees, `null` for achromatic colors)

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
combination tables from the PDFs, and converts the CMYK to sRGB through the
charts' embedded Coated FOGRA39 ICC profile, using relative colorimetric
intent with black point compensation. Names are taken from the chart labels,
with truncated words spelled out (`Cam.` → `Camouflage`, `Unif.` →
`Uniform`, …).

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

Each extractor replaces only its own colors and layouts, so either can be
re-run on its own. Layouts keep their place in the file, so to build it from
nothing, run them in this order:

```sh
pip install -r scripts/requirements.txt
python scripts/extract_vallejo.py game.pdf model.pdf data   # PDFs: see the script
python scripts/extract_squidmar.py data/sources/squidmar-mega-set.webp \
  data/sources/squidmar-essentials.webp data
node scripts/add-oklch.js data/vallejo.json
```

The RGB values are what the official chart looks like on screen, not a
measurement of dried paint. Vallejo notes that printed chart colors are only
approximate. The Squidmar values are one step further removed: they are the
colors of a compressed marketing image.

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
