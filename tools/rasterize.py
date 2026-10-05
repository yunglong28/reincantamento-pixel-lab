"""Rasterize the RE-INCANTAMENTO brand SVGs onto their native pixel grid.

The logos are drawn as orthogonal polygons on a regular grid. This script
parses the SVG paths (M/H/V/h/v/l/s/Z + polygons + rects), samples the centre
of every grid cell with an even-odd test and prints the grid as X/. rows.

    python3 tools/rasterize.py brand/occhio.svg 16 8
    python3 tools/rasterize.py brand/goccia.svg 8 11
"""
import re, sys, json

def tokens(d):
    return re.findall(r'[A-Za-z]|-?(?:\d+\.\d*|\.\d+|\d+)(?:e-?\d+)?', d)

def parse_path(d):
    polys, cur, x, y, cmd = [], [], 0.0, 0.0, None
    t = tokens(d); i = 0
    def num():
        nonlocal i; v = float(t[i]); i += 1; return v
    while i < len(t):
        if re.match(r'[A-Za-z]', t[i]):
            cmd = t[i]; i += 1
            if cmd in 'Zz':
                if cur: polys.append(cur)
                cur = []; continue
        if cmd == 'M': x, y = num(), num(); cur = [(x, y)]; cmd = 'L'
        elif cmd == 'm': x, y = x + num(), y + num(); cur = [(x, y)]; cmd = 'l'
        elif cmd == 'L': x, y = num(), num(); cur.append((x, y))
        elif cmd == 'l': x, y = x + num(), y + num(); cur.append((x, y))
        elif cmd == 'H': x = num(); cur.append((x, y))
        elif cmd == 'h': x += num(); cur.append((x, y))
        elif cmd == 'V': y = num(); cur.append((x, y))
        elif cmd == 'v': y += num(); cur.append((x, y))
        elif cmd == 's':  # degenerate smooth curve used by Illustrator for straight joins
            num(); num(); x, y = x + num(), y + num(); cur.append((x, y))
        else: raise ValueError('unsupported command ' + cmd)
    if cur: polys.append(cur)
    return polys

def shapes(svg):
    out = []
    for d in re.findall(r'<path[^>]*\sd="([^"]+)"', svg): out.append(parse_path(d))
    for p in re.findall(r'<polygon[^>]*points="([^"]+)"', svg):
        n = list(map(float, p.split())); out.append([list(zip(n[::2], n[1::2]))])
    for r in re.findall(r'<rect([^>]*)/?>', svg):
        a = dict(re.findall(r'(\w+)="([^"]+)"', r)); x, y, w, h = (float(a.get(k, 0)) for k in ('x', 'y', 'width', 'height'))
        out.append([[(x, y), (x + w, y), (x + w, y + h), (x, y + h)]])
    return out

def inside(polys, px, py):
    c = False
    for poly in polys:
        n = len(poly)
        for k in range(n):
            (x1, y1), (x2, y2) = poly[k], poly[(k + 1) % n]
            if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def rasterize(path, cols, rows):
    svg = open(path).read()
    vb = list(map(float, re.search(r'viewBox="([^"]+)"', svg).group(1).split()))
    cw, ch = vb[2] / cols, vb[3] / rows
    sh = shapes(svg)
    return [''.join('X' if any(inside(s, vb[0] + (cx + .5) * cw, vb[1] + (cy + .5) * ch) for s in sh) else '.'
                    for cx in range(cols)) for cy in range(rows)], (cw, ch)

if __name__ == '__main__':
    rows, cell = rasterize(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
    print(f'cell {cell[0]:.3f} x {cell[1]:.3f}', file=sys.stderr)
    print('\n'.join(rows)) if '--json' not in sys.argv else print(json.dumps(rows))
