"""Build src/icons.js from the v1 icon set, conformed to the brand grid.

Rules taken from brand/occhio.svg and brand/goccia.svg (see README):
  1. Every pixel touches another pixel orthogonally. Diagonals are drawn as
     staircases whose steps overlap by one cell (no X. / .X joins).
  2. No orphan pixels.
  3. Drops are always the brand drop: the exact 8x11 goccia, or the drop
     silhouette area-sampled onto a smaller grid (tip on the left of centre,
     second row growing right).
  4. The core of an eye or drop is a 2x2 block.

    python3 tools/build_icons.py            # writes src/icons.js
    python3 tools/build_icons.py --sheet    # also writes build/compare.png
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from rasterize import rasterize, shapes, inside

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# ---------------------------------------------------------------- grids
def G(rows): return [[1 if c == 'X' else 0 for c in r] for r in rows]
def R(g): return [''.join('X' if v else '.' for v in r) for r in g]
def blank(w, h): return [[0] * w for _ in range(h)]
def stamp(g, s, x0, y0, mode=1):
    """mode 1 = ink, 0 = erase where s is inked."""
    for y, r in enumerate(s):
        for x, v in enumerate(r):
            if v and 0 <= y0 + y < len(g) and 0 <= x0 + x < len(g[0]): g[y0 + y][x0 + x] = mode
    return g
def clear(g, x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 0
    return g
def flipv(g): return [r[:] for r in g[::-1]]

def staircase(g):
    """Bridge every diagonal-only join with the cell nearer the ink centroid,
    so outlines thicken inward and the outer silhouette stays put (as in the logo)."""
    g = [r[:] for r in g]; h, w = len(g), len(g[0])
    pts = [(x, y) for y in range(h) for x in range(w) if g[y][x]]
    if not pts: return g
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    changed = True
    while changed:
        changed = False
        for y in range(h - 1):
            for x in range(w - 1):
                a, b, c, d = g[y][x], g[y][x + 1], g[y + 1][x], g[y + 1][x + 1]
                if a == d and b == c and a != b:
                    cand = [(x + 1, y), (x, y + 1)] if a else [(x, y), (x + 1, y + 1)]
                    bx, by = min(cand, key=lambda p: (p[0] + .5 - cx - .5) ** 2 + (p[1] + .5 - cy - .5) ** 2)
                    g[by][bx] = 1; changed = True
    return g

def orphans(g):
    h, w = len(g), len(g[0]); at = lambda x, y: 0 <= x < w and 0 <= y < h and g[y][x]
    return [(x, y) for y in range(h) for x in range(w) if g[y][x] and not any(at(x + a, y + b) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b)]

# ---------------------------------------------------------------- brand
def drop_silhouette(cols, rows, N=12):
    svg = open(P('brand', 'goccia.svg')).read()
    outer = shapes(svg)[0][0]; W, H = 68.95, 94.73; cw, ch = W / cols, H / rows
    return [[1 if sum(inside([outer], (cx + (i + .5) / N) * cw, (cy + (j + .5) / N) * ch) for i in range(N) for j in range(N)) * 2 >= N * N else 0
             for cx in range(cols)] for cy in range(rows)]

EYE = G(rasterize(P('brand', 'occhio.svg'), 16, 8)[0])
DROP = G(rasterize(P('brand', 'goccia.svg'), 8, 11)[0])
DROP_FULL = drop_silhouette(8, 11)
DROP_M = drop_silhouette(6, 8)
DROP_S = drop_silhouette(4, 6)
DROP_XS = drop_silhouette(4, 5)
TEAR = G(['.X.', '.XX', 'XXX', '.X.'])   # 3-wide: the only size the silhouette can't be sampled at

def drop_with_core(core):
    g = [r[:] for r in DROP]; clear(g, 1, 5, 6, 8); return stamp(g, G(core), 1, 5)

# ---------------------------------------------------------------- build
def build():
    v1 = json.load(open(P('tools', 'icons-v1.json')))
    out = {'brand': {
        'occhio': EYE, 'goccia': DROP, 'goccia-piena': DROP_FULL,
        'goccia-m': DROP_M, 'goccia-s': DROP_S, 'goccia-xs': DROP_XS,
    }}

    d = {}
    d['base'] = DROP
    solid = [r[:] for r in DROP_FULL]; clear(solid, 3, 6, 4, 7); d['solid'] = solid
    o = [r[:] for r in DROP]; clear(o, 3, 6, 4, 7); d['outline'] = o
    d['nested'] = drop_with_core(['......', '..X...', '..XX..', '..XX..'])
    d['star'] = drop_with_core(['..XX..', '.XXXX.', '.XXXX.', '..XX..'])
    d['pin'] = flipv(DROP)
    kh = [r[:] for r in DROP_FULL]; clear(kh, 2, 5, 5, 6); clear(kh, 3, 7, 4, 8); d['keyhole'] = kh
    dt = [r[:] for r in DROP]
    for y in range(11):
        for x in range(8):
            if DROP_FULL[y][x] and not dt[y][x] and (x + y) % 2 == 0: dt[y][x] = 1
    d['dither'] = dt
    we = blank(16, 14); stamp(we, EYE, 0, 0); stamp(we, DROP_XS, 6, 9); d['weeping-eye'] = we
    d['portal'] = G(v1['drops']['portal'])
    out['drops'] = d

    # every other set: start from v1, swap in brand drops, then staircase
    for st in v1:
        if st == 'drops': continue
        out[st] = {k: G(v) for k, v in v1[st].items()}
    E, A, DA = out['esoteric'], out['acephale'], out['drops-archive']

    g = A['acephale-drop']; clear(g, 0, 0, 10, 6); stamp(g, DROP_S, 4, 0)

    g = clear(E['crystal-ball'], 3, 3, 9, 9); stamp(g, DROP_XS, 5, 5)
    g[3][3] = g[3][4] = g[4][3] = 1                            # highlight
    g = clear(E['grimoire'], 8, 1, 13, 7); stamp(g, DROP_XS, 9, 2)
    g = E['black-mirror']; clear(g, 2, 2, 8, 9)
    mirror = drop_silhouette(6, 8); clear(mirror, 2, 4, 3, 5)  # drop scooped into the glass, brand core
    stamp(g, mirror, 2, 2)

    nc = blank(8, 12)
    for y in range(9): nc[y][3] = 1
    stamp(nc, G(['....XX..', '.....XX.', '......X.']), 0, 0)
    stamp(nc, DROP_S, 0, 6); DA['34-nchant'] = nc

    bl = blank(8, 17); stamp(bl, DROP_FULL, 0, 0)
    stamp(bl, G(['XX', 'XX']), 3, 12); stamp(bl, G(['XX']), 3, 15); DA['36-how-to-bleed'] = bl

    g = DA['57-goodbye-poverty-jetset']; clear(g, 0, 8, 12, 12); stamp(g, DROP_XS, 8, 8)

    g = DA['08-phantom-in-the-chain']; clear(g, 0, 8, 10, 12)
    stamp(g, G(['.X.', 'XXX', 'X.X', 'XXX', '.X.']), 4, 8)          # orthogonal chain link

    DA['33-madness-of-vision'] = G([                                 # spiral drawn with right angles only
        '.....XXXXX.....', '...XXX...XXX...', '.XXX.......XXX.', 'XX...XXXXX...XX',
        'X........X....X', 'X....XXX.X....X', 'X....X...X....X', 'XX...XXXXX...XX',
        '.XXX.......XXX.', '...XXX...XXX...', '.....XXXXX.....'])

    g = out['archives']['signal-halo']; clear(g, 0, 5, 12, 11); stamp(g, DROP_M, 4, 5)

    # brand rules everywhere except textures whose subject is the checkerboard
    TEXTURE = {('drops', 'dither'), ('drops-archive', '15-paths-of-symmetry')}
    for st in out:
        if st == 'brand': continue
        for k in out[st]:
            if (st, k) in TEXTURE: continue
            out[st][k] = staircase(out[st][k])
    # orphans that are meaning-bearing (drips, stars) become 2x1 marks; the rest go
    for st in out:
        for k, g in out[st].items():
            if (st, k) in TEXTURE: continue
            for x, y in orphans(g):
                if x + 1 < len(g[0]) and not g[y][x + 1]: g[y][x + 1] = 1
                elif x > 0: g[y][x - 1] = 1
            out[st][k] = staircase(g) if st != 'brand' else g
    return {st: {k: R(g) for k, g in s.items()} for st, s in out.items()}

def sheet(v1, v2, path):
    from PIL import Image, ImageDraw
    S, PAD = 6, 10
    items = [(st, k) for st in v2 for k in v2[st]]
    cols = 6; cw, chh = 2 * 17 * S + 3 * PAD, 24 * S + 2 * PAD
    img = Image.new('RGB', (cols * cw, ((len(items) + cols - 1) // cols) * chh), '#D9D9D9'); dr = ImageDraw.Draw(img)
    for i, (st, k) in enumerate(items):
        ox, oy = (i % cols) * cw + PAD, (i // cols) * chh + PAD
        for j, rows in enumerate([v1.get(st, {}).get(k), v2[st][k]]):
            if not rows: continue
            bx = ox + j * (17 * S + PAD)
            for y, r in enumerate(rows):
                for x, c in enumerate(r):
                    if c == 'X': dr.rectangle([bx + x * S, oy + y * S, bx + x * S + S - 1, oy + y * S + S - 1], fill='#0000FF' if j else '#7a7a7a')
        dr.text((ox, oy + 22 * S), k[:28], fill='#000')
    img.save(path)

if __name__ == '__main__':
    v2 = build()
    os.makedirs(P('src'), exist_ok=True)
    with open(P('src', 'icons.js'), 'w') as f:
        f.write('// Generated by tools/build_icons.py from tools/icons-v1.json + brand/*.svg. Do not edit by hand:\n')
        f.write('// draw in the lab, export JSON, and save it as tools/icons-v1.json (or add an override in the script).\n')
        f.write('window.ICONS = ' + json.dumps(v2, separators=(',', ':')) + ';\n')
    if '--sheet' in sys.argv:
        os.makedirs(P('build'), exist_ok=True)
        sheet(json.load(open(P('tools', 'icons-v1.json'))), v2, P('build', 'compare.png'))
    print(sum(len(s) for s in v2.values()), 'icons')
