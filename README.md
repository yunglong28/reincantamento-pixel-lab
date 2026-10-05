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
