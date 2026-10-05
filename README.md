# REINCANTAMENTO pixel lab

Pixel-icon editor and icon set for RE-INCANTAMENTO / DROPS, aligned with the brand logos.

Open `index.html` in a browser. There's no build step and no dependencies apart from JSZip, which is only used for the ZIP export.

## The grid, measured on the logos

| File | Grid | Module (pt) |
|---|---|---|
| `brand/occhio.svg` (logo.svg) | 16 × 8 | 4.872 × 4.883 |
| `brand/goccia.svg` (Asset 3.svg) | 8 × 11 | 8.619 × 8.612 |
| `brand/logotipo.svg` | 21 rows | 2.516 × 2.603 |

`tools/rasterize.py` reads the logo paths and samples the centre of each cell. Its output is the `brand` set. The eye matches the Illustrator artboard cell for cell.

The rules the logos follow, which every icon now follows too:

1. **No diagonal-only joins.** A diagonal is drawn as a staircase whose steps overlap by one cell. A 2×2 window is never `X. / .X`.
2. **No orphan pixels.**
3. **One drop.** Every drop is the brand drop: either the exact 8×11 drop, or its outline area-sampled onto a smaller grid (`goccia-m` 6×8, `goccia-s` 4×6, `goccia-xs` 4×5). The tip sits left of centre and the second row grows to the right.
4. **The core is 2×2**, as in the pupil of the eye and of the drop.
5. The eye has **180° rotational symmetry**, not mirror symmetry. The lab detects this, and you can paint with it.

## What changed compared with the claude.ai version (v1)

- New `brand` set: the eye and drop rasterized from the SVGs, plus the drop at smaller sizes.
- The `drops` set is redrawn on the real 8×11 drop. Before, it was an approximate 9×12 drop.
- Drops inside other icons were replaced with the brand drop: acephale-drop, crystal-ball, grimoire, black-mirror, signal-halo, #34, #36 and #57.
- All diagonal joins became staircases, thickening toward the inside so the outer silhouette stays the same. #33 now has a right-angled spiral, and #08 has an orthogonal chain.
- Exceptions on purpose: `drops/dither` and `#15 paths-of-symmetry`, because their subject is the texture itself.
- Editor:
  - p5.js is gone and the editor now uses pointer events, so touch no longer fires twice.
  - The canvas redraws only on changes, not 60 times a second.
  - Redo, plus ⌘Z / ⇧⌘Z.
  - 180° symmetry, and a 180° rotation operation.
  - A **Gradini** button applies rule 1.
  - Orange markers show diagonal joins.
  - **Confronto brand** shows your icon next to the eye and drop at the same scale.
- Export:
  - SVGs come out at the **logo module** (4.872 or 8.619 pt), so they go into Illustrator at the same size as the mark.
  - Downloads work outside claude.ai as well.
  - Added a JSON import.

## Regenerating the icons

```sh
python3 tools/build_icons.py --sheet   # src/icons.js + build/compare.png (v1 grey, v2 blue)
```

`tools/icons-v1.json` holds the original icons. Brand corrections and per-icon overrides live in `tools/build_icons.py`. If you edit icons in the lab, export the JSON and either replace `tools/icons-v1.json` with it or re-import it into the lab.

## Home page with glyphs (`home/`)

`home/index.html` is a copy of the reincantamento-site homepage with one extra layer added, `home/assets/js/glyphs.js`. The pixel-lab icons, read from `src/icons.js`, appear inside the empty squares of the grid on a clock at 104 BPM, counted in sixteenths.

- **How the rhythm works.** Every two bars the clock picks a new pattern. It can be a euclidean pulse, a sweep along a row, an echo in the cell rotated 180°, a cluster, or almost nothing. Some beats are dropped and some ghost notes are added, so the rhythm doesn't settle into a loop.
- **How a glyph lives.** Each one builds up pixel by pixel, holds, then either dissolves or turns into another icon. Some appear inside a filled band-coloured square.
- **What it adapts to.** It reads the colour tokens, so acid mode works too. It also respects `prefers-reduced-motion` and pauses when the tab is hidden.
- **Where the links go.** The menu links point at the live site, because only the homepage was copied here.

`home/crazy.html` runs the same engine with `data-mode="crazy"`:

- **Tempo.** 132 BPM, with a triplet layer running against the sixteenths.
- **No repeats.** The same symbol never appears twice on screen at the same time.
- **Shapes.** Some glyphs take a 2×2 block of cells, and up to three glyphs walk from cell to cell.
- **Drops.** Falling drops seed a glyph where they land.
- **Texture.** Glitches shift rows of pixels and add ghost copies, and the last frames fade out as trails.
- **Safety.** There are no full-screen flashes.

`home/flow.html` uses its own engine, `home/assets/js/flow.js`, in which the grid loosens its hold on the glyphs. It runs at 84 BPM, and the same symbol never appears twice on screen at once.

- **Settling.** Glyphs still settle into squares of the grid.
- **Migrations.** When a glyph's time is up, it usually breaks into a ribbon of pixels. The ribbon snakes along an S-curve to another square and lands there as a different symbol.
- **Drifters.** Sometimes a glyph lifts off the grid instead and wanders on slow Lissajous paths. The white grid lines bend around it like a lens. When it tires, it glides back into the nearest empty square.

`home/merge.html` combines the calm home and flow, using the same engine with `data-mode="merge"`. It runs at 96 BPM.

- **Arrivals.** Glyphs arrive with the calm figures: euclidean pulses, sweeps, the echo rotated 180°, clusters and hushes. They are built pixel by pixel, some inside a filled square.
- **Leaving.** Glyphs then leave the flow way, as migrating ribbons or as drifters that bend the grid.
- **Repeats.** The only time a symbol appears twice is an echo and its twin.

To preview it, run `python3 -m http.server` from the repo root and open `/home/index.html`. `home/` loads `../src/icons.js`, so any change made in the lab and rebuilt with `build_icons.py` reaches the home page too.
