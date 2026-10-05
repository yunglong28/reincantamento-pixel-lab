// Grid helpers shared by the lab. Same rules as tools/build_icons.py.
(function () {
  const toGrid = rows => rows.map(r => [...r].map(c => (c === 'X' ? 1 : 0)));
  const toRows = g => g.map(r => r.map(v => (v ? 'X' : '.')).join(''));
  const clone = g => g.map(r => r.slice());
  const at = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length && g[y][x];

  function neighbours(g, x, y) {
    let n4 = 0, nd = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && at(g, x + dx, y + dy)) dx && dy ? nd++ : n4++;
    }
    return [n4, nd];
  }

  // Diagonal-only joins: 2x2 windows shaped X. / .X or .X / X.
  function checkers(g) {
    const out = [];
    for (let y = 0; y < g.length - 1; y++) for (let x = 0; x < g[0].length - 1; x++) {
      const a = g[y][x], b = g[y][x + 1], c = g[y + 1][x], d = g[y + 1][x + 1];
      if (a === d && b === c && a !== b) out.push([x, y]);
    }
    return out;
  }

  function lint(g) {
    const orph = []; let ink = 0;
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x]) {
      ink++; const [a, b] = neighbours(g, x, y); if (!a && !b) orph.push([x, y]);
    }
    const h = g.length, w = g[0].length;
    let mirror = true, rot = true;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (g[y][x] !== g[y][w - 1 - x]) mirror = false;
      if (g[y][x] !== g[h - 1 - y][w - 1 - x]) rot = false;
    }
    return { orph, diag: checkers(g), ink, density: ink / (w * h), mirror, rot };
  }

  // Bridge every diagonal-only join with the empty cell nearer the ink centroid,
  // so outlines thicken inward and the silhouette stays put, as in the logo.
  function staircase(src) {
    const g = clone(src); let sx = 0, sy = 0, n = 0;
    g.forEach((r, y) => r.forEach((v, x) => { if (v) { sx += x; sy += y; n++; } }));
    if (!n) return g;
    const cx = sx / n, cy = sy / n, d2 = ([x, y]) => (x - cx) ** 2 + (y - cy) ** 2;
    for (let guard = 0, hit = true; hit && guard < 64; guard++) {
      hit = false;
      for (const [x, y] of checkers(g)) {
        if (!(g[y][x] === g[y + 1][x + 1] && g[y][x + 1] === g[y + 1][x] && g[y][x] !== g[y][x + 1])) continue;
        const cand = g[y][x] ? [[x + 1, y], [x, y + 1]] : [[x, y], [x + 1, y + 1]];
        const [bx, by] = d2(cand[0]) <= d2(cand[1]) ? cand[0] : cand[1];
        g[by][bx] = 1; hit = true;
      }
    }
    return g;
  }

  // Path in grid units, one rectangle per horizontal run; scaled on export.
  function svgOf(g, col, unit = 1) {
    const f = v => +(v * unit).toFixed(3);
    let d = '';
    g.forEach((r, y) => {
      for (let x = 0; x < r.length;) {
        if (!r[x]) { x++; continue; }
        const s = x; while (x < r.length && r[x]) x++;
        d += `M${f(s)} ${f(y)}H${f(x)}V${f(y + 1)}H${f(s)}Z`;
      }
    });
    const W = f(g[0].length), H = f(g.length);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges"><path fill="${col}" d="${d}"/></svg>`;
  }

  function drawTo(cv, g, s, col, bg) {
    cv.width = g[0].length * s; cv.height = g.length * s;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); }
    c.fillStyle = col; g.forEach((r, y) => r.forEach((v, x) => { if (v) c.fillRect(x * s, y * s, s, s); }));
  }

  window.Grid = { toGrid, toRows, clone, neighbours, checkers, lint, staircase, svgOf, drawTo };
})();
