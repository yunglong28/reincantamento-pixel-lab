/* REINCANTAMENTO — flow: the grid loses its hold on the glyphs.
   Glyphs still settle into squares of the grid, pixel by pixel, on an 84 BPM
   clock. But they do not stay put:
     migrations — a settled glyph comes apart into a ribbon of pixels that
       snakes along an S-curve to another square and lands there as a
       different symbol;
     drifters — one or two glyphs lift off the grid and wander on slow
       Lissajous paths, behind the statement and across the squares; the grid
       lines bend around them like a lens. When a drifter tires it glides back
       into the nearest empty square.
   No symbol is on screen twice. Decorative only: aria-hidden canvas, no pointer
   events, still frame under prefers-reduced-motion, paused while hidden. */
(() => {
    'use strict';

    const ICONS = window.ICONS;
    if (!ICONS) return;

    const BPM = 84;
    const SIXTEENTH = 60000 / BPM / 4;
    const FILL = 0.14;                       // share of free squares holding a glyph
    const MAX_DRIFTERS = 2;
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rnd = n => Math.floor(Math.random() * n);
    const rand = (a, b) => a + Math.random() * (b - a);
    const chance = p => Math.random() < p;
    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * u);

    // ---- icons
    const icons = [];
    for (const set in ICONS) for (const name in ICONS[set]) {
        const rows = ICONS[set][name];
        if (rows.length > 18 || rows[0].length > 18) continue;
        icons.push(rows.map(r => [...r].map(c => c === 'X')));
    }
    const pixelsOf = g => { const p = []; g.forEach((row, y) => row.forEach((v, x) => { if (v) p.push([x, y]); })); return p; };
    const scan = px => px.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const shuffle = px => px.sort(() => Math.random() - 0.5);

    // ---- canvas
    const cv = document.createElement('canvas');
    cv.className = 'glyph-layer';
    cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.querySelector('.grid-layer'));
    const ctx = cv.getContext('2d');

    let colW = 90, rowH = 90, cols = 0, rows = 0, W = 0, H = 0, dpr = 1, P = 4;
    let free = [], freeSet = new Set();
    const key = (c, r) => c + ',' + r;
    const css = n => getComputedStyle(root).getPropertyValue(n).trim();
    let ink = '#0009ff', bg = '#d9d9d9', line = '#ffffff';
    const readColours = () => { ink = css('--ink') || ink; bg = css('--bg') || bg; line = css('--line') || line; };

    const settled = new Map();               // "c,r" -> glyph sitting in a square
    const reserved = new Set();              // squares a migration is heading to
    const migrations = [];
    const drifters = [];

    // pixel size of a glyph fitted to one square
    const pxFor = g => Math.max(1, Math.floor(Math.min(colW, rowH) * 0.62 / Math.max(g.length, g[0].length)));
    const cellCentre = (c, r) => [c * colW + colW / 2, r * rowH + rowH / 2];

    function measure() {
        colW = parseFloat(css('--grid-col')) || 90;
        rowH = parseFloat(css('--grid-row')) || 90;
        H = parseFloat(css('--screen-h')) || window.innerHeight;
        W = root.clientWidth;
        cols = Math.round(W / colW); rows = Math.round(H / rowH);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.style.height = H + 'px';
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        const blocks = ['.statement', '.site-header', '.media-cell', '.theme-switch']
            .map(s => document.querySelector(s)).filter(Boolean)
            .map(el => el.getBoundingClientRect())
            .map(b => ({ l: b.left, t: b.top + window.scrollY, r: b.right, b: b.bottom + window.scrollY }));
        free = [];
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
            const x0 = c * colW + 2, y0 = r * rowH + 2, x1 = (c + 1) * colW - 2, y1 = (r + 1) * rowH - 2;
            if (!blocks.some(b => x0 < b.r && x1 > b.l && y0 < b.b && y1 > b.t)) free.push([c, r]);
        }
        freeSet = new Set(free.map(([c, r]) => key(c, r)));
        for (const k of [...settled.keys()]) if (!freeSet.has(k)) settled.delete(k);
        migrations.length = 0; reserved.clear();
    }

    // ---- identity: one of each symbol at a time
    function inUse() {
        const s = new Set();
        for (const g of settled.values()) s.add(g.id);
        for (const m of migrations) s.add(m.toId);
        for (const d of drifters) s.add(d.id);
        return s;
    }
    function pickId(extra) {
        const used = inUse(); if (extra != null) used.add(extra);
        const open = []; for (let i = 0; i < icons.length; i++) if (!used.has(i)) open.push(i);
        return open.length ? open[rnd(open.length)] : null;
    }
    const emptyCells = () => free.filter(([c, r]) => !settled.has(key(c, r)) && !reserved.has(key(c, r)));

    // ---- settled glyphs: build up, hold, then leave (dissolve, migrate or lift off)
    function settle(c, r, id, opts = {}) {
        const g = icons[id];
        const px = opts.px || shuffle(pixelsOf(g));
        const gl = { id, g, px, c, r, shown: opts.shown || 0, rate: Math.max(1, Math.ceil(px.length / rand(6, 14))), hold: 24 + rnd(48), phase: 'in' };
        settled.set(key(c, r), gl);
        return gl;
    }
    function stepSettled(gl) {
        if (gl.phase === 'in') { gl.shown = Math.min(gl.px.length, gl.shown + gl.rate); if (gl.shown === gl.px.length) gl.phase = 'hold'; }
        else if (gl.phase === 'hold') { if (--gl.hold <= 0) gl.phase = 'leave'; }
        else if (gl.phase === 'out') { gl.shown = Math.max(0, gl.shown - gl.rate); if (!gl.shown) settled.delete(key(gl.c, gl.r)); }
    }

    // ---- migrations: pixels flow along an S-shaped cubic from one point to a square
    function bez(m, u) {
        const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
        return [a * m.p0[0] + b * m.p1[0] + c * m.p2[0] + d * m.p3[0], a * m.p0[1] + b * m.p1[1] + c * m.p2[1] + d * m.p3[1]];
    }
    function bezT(m, u) {
        const v = 1 - u;
        const tx = 3 * v * v * (m.p1[0] - m.p0[0]) + 6 * v * u * (m.p2[0] - m.p1[0]) + 3 * u * u * (m.p3[0] - m.p2[0]);
        const ty = 3 * v * v * (m.p1[1] - m.p0[1]) + 6 * v * u * (m.p2[1] - m.p1[1]) + 3 * u * u * (m.p3[1] - m.p2[1]);
        const l = Math.hypot(tx, ty) || 1; return [tx / l, ty / l];
    }

    // src: list of absolute pixel positions [x,y] (screen px, top-left of each pixel) and the point they leave from
    function migrate(src, from, toCell, toId, now) {
        const [c, r] = toCell, g = icons[toId], p = pxFor(g);
        const dstPx = scan(pixelsOf(g));
        const ox = Math.round(c * colW + (colW - g[0].length * p) / 2), oy = Math.round(r * rowH + (rowH - g.length * p) / 2);
        const to = cellCentre(c, r);
        const dx = to[0] - from[0], dy = to[1] - from[1], dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist, ny = dx / dist, bend = dist * rand(0.35, 0.7) * (chance(0.5) ? 1 : -1);
        const m = {
            p0: from, p3: to,
            p1: [from[0] + dx * 0.33 + nx * bend, from[1] + dy * 0.33 + ny * bend],
            p2: [from[0] + dx * 0.66 - nx * bend * rand(0.6, 1.2), from[1] + dy * 0.66 - ny * bend * rand(0.6, 1.2)],
            start: now, dur: 2600 + dist * 2.2, spread: 0.4,
            src: src.map(([x, y]) => [x - from[0], y - from[1]]),
            dst: dstPx.map(([x, y]) => [ox + x * p - to[0], oy + y * p - to[1]]),
            p, toCell, toId, dstPx, wob: rand(1.2, 2.4), amp: Math.min(colW, rowH) * rand(0.15, 0.3),
        };
        reserved.add(key(c, r));
        migrations.push(m);
    }
    function finishMigration(m) {
        reserved.delete(key(...m.toCell));
        if (!freeSet.has(key(...m.toCell))) return;
        const gl = settle(m.toCell[0], m.toCell[1], m.toId, { px: m.dstPx, shown: Math.min(m.src.length, m.dst.length) });
        if (gl.shown >= gl.px.length) gl.phase = 'hold';
    }

    function migrationPixels(m, now, out) {
        const tau = (now - m.start) / m.dur;
        const n = Math.max(m.src.length, m.dst.length), pair = Math.min(m.src.length, m.dst.length);
        for (let i = 0; i < n; i++) {
            if (i >= m.src.length) continue;                         // extra target pixels arrive once landed
            const u = ease(clamp01((tau - (i / n) * m.spread) / (1 - m.spread)));
            const [bx, by] = bez(m, u), [tx, ty] = bezT(m, u);
            const cohesion = 1 - 0.85 * Math.sin(Math.PI * u);
            const so = m.src[i], d = m.dst[i < pair ? i : pair - 1] || [0, 0];
            const offx = (so[0] * (1 - u) + d[0] * u) * cohesion, offy = (so[1] * (1 - u) + d[1] * u) * cohesion;
            const w = m.amp * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * (u * m.wob) + i * 0.25);
            const alpha = i >= pair ? 1 - u : 1;                      // surplus source pixels thin out on the way
            out.push([bx + offx - ty * w, by + offy + tx * w, alpha, m.p]);
        }
        return tau >= 1;
    }

    // ---- drifters: Lissajous paths across the whole first screen
    function lift(gl, now) {
        settled.delete(key(gl.c, gl.r));
        const [x0, y0] = cellCentre(gl.c, gl.r);
        const cx = W / 2, cy = H / 2, ax = W * 0.44, ay = H * 0.38;
        const s = v => Math.max(-1, Math.min(1, v));
        const d = {
            id: gl.id, g: gl.g, px: pixelsOf(gl.g), p: pxFor(gl.g),
            cx, cy, ax, ay, wx: rand(0.05, 0.09) * 2 * Math.PI / 1000, wy: rand(0.06, 0.11) * 2 * Math.PI / 1000,
            fx: 0, fy: 0, t0: now, life: rand(14000, 24000), x: x0, y: y0,
        };
        d.fx = chance(0.5) ? Math.asin(s((x0 - cx) / ax)) : Math.PI - Math.asin(s((x0 - cx) / ax));
        d.fy = chance(0.5) ? Math.asin(s((y0 - cy) / ay)) : Math.PI - Math.asin(s((y0 - cy) / ay));
        drifters.push(d);
    }
    function moveDrifter(d, now) {
        const t = now - d.t0;
        d.x = d.cx + d.ax * Math.sin(d.wx * t + d.fx) + colW * 0.3 * Math.sin(d.wy * 2.3 * t);
        d.y = d.cy + d.ay * Math.sin(d.wy * t + d.fy) + rowH * 0.3 * Math.sin(d.wx * 1.7 * t + 1);
    }
    function drifterPixels(d) {
        const ox = Math.round(d.x - d.g[0].length * d.p / 2), oy = Math.round(d.y - d.g.length * d.p / 2);
        return d.px.map(([x, y]) => [ox + x * d.p, oy + y * d.p]);
    }
    function landDrifter(d, now) {
        const e = emptyCells(); if (!e.length) return false;
        let best = e[0], bd = Infinity;
        for (const cell of e) { const [x, y] = cellCentre(...cell), dd = Math.hypot(x - d.x, y - d.y); if (dd < bd) { bd = dd; best = cell; } }
        drifters.splice(drifters.indexOf(d), 1);
        migrate(drifterPixels(d), [d.x, d.y], best, d.id, now);
        return true;
    }

    // ---- the bent grid: around a point, erase the straight lines and redraw them pushed outward
    function lens(cx, cy, strength) {
        const R = 2.6 * Math.max(colW, rowH), R0 = 1.15 * Math.max(colW, rowH), A = 0.32 * Math.min(colW, rowH) * strength, step = 5;
        const field = (x, y) => {
            const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) + 1e-3, f = Math.exp(-(r / R0) * (r / R0));
            return [x + dx / r * A * f, y + dy / r * A * f, f];
        };
        const segs = (x0, y0, x1, y1, vertical) => {
            const len = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(len / step);
            let prev = field(x0, y0);
            for (let i = 1; i <= n; i++) {
                const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, cur = field(x, y);
                const a = Math.min(1, cur[2] * 2.2 * strength);
                if (a > 0.02) {
                    ctx.globalAlpha = a; ctx.fillStyle = bg;           // hide the painted straight line here
                    if (vertical) ctx.fillRect(x0 - 0.5, y - step, 2, step + 0.5); else ctx.fillRect(x - step, y0 - 0.5, step + 0.5, 2);
                    ctx.strokeStyle = line; ctx.lineWidth = 1;         // and draw it bent
                    ctx.beginPath(); ctx.moveTo(prev[0] + 0.5, prev[1] + 0.5); ctx.lineTo(cur[0] + 0.5, cur[1] + 0.5); ctx.stroke();
                }
                prev = cur;
            }
        };
        for (let k = Math.max(0, Math.floor((cx - R) / colW)); k * colW <= Math.min(W, cx + R); k++) segs(k * colW, Math.max(0, cy - R), k * colW, Math.min(H, cy + R), true);
        for (let k = Math.max(0, Math.floor((cy - R) / rowH)); k * rowH <= Math.min(H, cy + R); k++) segs(Math.max(0, cx - R), k * rowH, Math.min(W, cx + R), k * rowH, false);
        ctx.globalAlpha = 1;
    }

    // ---- rhythm
    const euclid = (k, n) => { const o = []; for (let i = 0; i < n; i++) o.push(Math.floor((i + 1) * k / n) - Math.floor(i * k / n)); return o; };
    let sixteenth = 0, pattern = euclid(3, 8), nextBeat = 0;
    function onSixteenth(now) {
        const s = sixteenth % 32;
        if (s === 0) pattern = euclid([2, 3, 5][rnd(3)], [8, 8, 16][rnd(3)]);
        for (const gl of [...settled.values()]) stepSettled(gl);

        const target = Math.max(3, Math.round(free.length * FILL));
        if (pattern[s % pattern.length] && settled.size + migrations.length < target && chance(0.8)) {
            const e = emptyCells(), id = pickId();
            if (e.length && id != null) { const [c, r] = e[rnd(e.length)]; settle(c, r, id); }
        }
        // a glyph whose time is up waits for the beat, then mostly travels on, sometimes just fades
        if (s % 4 === 0) {
            for (const gl of [...settled.values()]) {
                if (gl.phase !== 'leave') continue;
                if (chance(0.3)) { gl.phase = 'out'; continue; }
                if (drifters.length < MAX_DRIFTERS && chance(0.3)) { lift(gl, now); continue; }
                const e = emptyCells().filter(([c, r]) => { const d = Math.hypot(c - gl.c, r - gl.r); return d >= 3 && d <= 9; });
                const id = pickId(gl.id);
                if (!e.length || id == null) { gl.phase = 'out'; continue; }
                const p = pxFor(gl.g), ox = Math.round(gl.c * colW + (colW - gl.g[0].length * p) / 2), oy = Math.round(gl.r * rowH + (rowH - gl.g.length * p) / 2);
                const src = scan(gl.px.slice(0, gl.shown)).map(([x, y]) => [ox + x * p, oy + y * p]);
                settled.delete(key(gl.c, gl.r));
                migrate(src, cellCentre(gl.c, gl.r), e[rnd(e.length)], id, now);
            }
        }
        for (const d of [...drifters]) if (now - d.t0 > d.life) landDrifter(d, now);
        sixteenth++;
    }

    // ---- frame
    function drawGlyphAt(gl) {
        const p = pxFor(gl.g), ox = Math.round(gl.c * colW + (colW - gl.g[0].length * p) / 2), oy = Math.round(gl.r * rowH + (rowH - gl.g.length * p) / 2);
        for (let i = 0; i < gl.shown; i++) { const [x, y] = gl.px[i]; ctx.fillRect(ox + x * p, oy + y * p, p, p); }
    }
    function frame(now) {
        if (!nextBeat) nextBeat = now;
        let n = 0; while (now >= nextBeat && n++ < 8) { onSixteenth(now); nextBeat += SIXTEENTH; }
        if (now - nextBeat > 1000) nextBeat = now;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        for (const d of drifters) { moveDrifter(d, now); lens(d.x, d.y, 1); }
        const flying = [];
        for (let i = migrations.length - 1; i >= 0; i--) {
            const m = migrations[i];
            if (migrationPixels(m, now, flying)) { migrations.splice(i, 1); finishMigration(m); }
            else { const u = ease(clamp01((now - m.start) / m.dur)); const [x, y] = bez(m, u); lens(x, y, 0.45 * Math.sin(Math.PI * u)); }
        }
        ctx.fillStyle = ink;
        for (const gl of settled.values()) drawGlyphAt(gl);
        for (const [x, y, a, p] of flying) { ctx.globalAlpha = a; ctx.fillRect(Math.round(x), Math.round(y), p, p); }
        ctx.globalAlpha = 1;
        for (const d of drifters) for (const [x, y] of drifterPixels(d)) ctx.fillRect(x, y, d.p, d.p);
    }

    // requestAnimationFrame, with a timeout fallback where frames never come (background tabs aside)
    let running = false;
    function loop() {
        if (!running) return;
        let done = false;
        const go = () => { if (done) return; done = true; frame(performance.now()); loop(); };
        requestAnimationFrame(go);
        setTimeout(go, 50);
    }
    const start = () => { if (!running) { running = true; nextBeat = 0; loop(); } };
    const stop = () => { running = false; };

    function still() {
        settled.clear(); drifters.length = 0; migrations.length = 0;
        for (let i = 0; i < Math.min(8, Math.floor(free.length * 0.18)); i++) {
            const e = emptyCells(), id = pickId(); if (!e.length || id == null) break;
            const [c, r] = e[rnd(e.length)]; const gl = settle(c, r, id); gl.shown = gl.px.length; gl.phase = 'hold'; gl.hold = Infinity;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = ink;
        for (const gl of settled.values()) drawGlyphAt(gl);
    }

    let queued = false;
    const refit = () => {
        if (queued) return; queued = true;
        requestAnimationFrame(() => requestAnimationFrame(() => { queued = false; measure(); if (reduced) still(); }));
    };

    readColours(); measure();
    if (reduced) still(); else start();
    window.addEventListener('resize', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    new MutationObserver(() => { readColours(); if (reduced) still(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', () => { if (!reduced) (document.hidden ? stop() : start()); });
})();
