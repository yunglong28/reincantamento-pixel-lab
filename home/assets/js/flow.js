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
   With data-mode="merge" on the <script> (merge.html), glyphs also arrive the
   way they do on the calm home: euclidean pulses, sweeps along a row, a twin in
   the cell rotated 180°, clusters and hushes, built pixel by pixel in scatter,
   scan, rain or bloom order, some inside a filled square.
   No symbol is on screen twice; in flow the echo's rotated twin is the one exception, in merge not even that.

   Timing: every journey lasts a whole number of beats and leaves on a beat, so
   ribbons and drifters land on the pulse. The piece breathes over sixteen
   bars (density rises and falls), and every so often the holding glyphs leave
   together, bending the same way, before a bar of near-silence. It opens on
   the brand eye and its rotated twin.

   Decorative only: aria-hidden canvas, no pointer events, still frame under
   prefers-reduced-motion, paused while hidden or scrolled out of view. */
(() => {
    'use strict';

    const ICONS = window.ICONS;
    if (!ICONS) return;

    const MODES = {
        // max: symbols on screen at once (settled + ribbons + drifters); intro: silent sixteenths before the first one
        flow:  { bpm: 84, fill: 0.14, figures: false, inverse: 0, brand: 1, hold: [24, 72], leave: 0.7, max: Infinity, intro: 0 },
        merge: { bpm: 96, fill: 0.24, figures: true, inverse: 0, brand: 0, hold: [24, 64], leave: 0.6, max: 6, intro: 32, skip: ['brand', 'drops'], skipNames: ['36-how-to-bleed', 'acephale-drop', 'weeping-eye', 'hyperlocal-pin', 'bonfire'], unique: true },
    };
    const script = document.currentScript;
    const M = MODES[(script && script.dataset.mode) || 'flow'] || MODES.flow;
    const SIXTEENTH = 60000 / M.bpm / 4;
    const FILL = M.fill;                     // share of free squares holding a glyph
    const MAX_DRIFTERS = 2;
    const MAX_MIGRATIONS = 3;                // ribbons in flight at once, outside a flock
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rnd = n => Math.floor(Math.random() * n);
    const rand = (a, b) => a + Math.random() * (b - a);
    const chance = p => Math.random() < p;
    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * u);

    // ---- icons
    const icons = [], pool = [];             // pool: icon ids, the brand eye and drop weighted up
    for (const set in ICONS) for (const name in ICONS[set]) {
        if (M.skip && M.skip.includes(set)) continue;               // merge: no eye, no drops
        if (M.skipNames && M.skipNames.includes(name)) continue;
        const rows = ICONS[set][name];
        if (rows.length > 18 || rows[0].length > 18) continue;
        const id = icons.push(rows.map(r => [...r].map(c => c === 'X'))) - 1;
        for (let i = 0; i < (set === 'brand' ? M.brand : 1); i++) pool.push(id);
    }
    const brandId = name => { let i = 0; for (const set in ICONS) for (const n in ICONS[set]) { if ((M.skip && M.skip.includes(set)) || (M.skipNames && M.skipNames.includes(n))) continue; const r = ICONS[set][n]; if (r.length > 18 || r[0].length > 18) continue; if (set === 'brand' && n === name) return i; i++; } return -1; };
    const EYE = brandId('occhio');
    const rot180 = g => g.slice().reverse().map(r => r.slice().reverse());
    const pixelsOf = g => { const p = []; g.forEach((row, y) => row.forEach((v, x) => { if (v) p.push([x, y]); })); return p; };
    const scan = px => px.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const shuffle = px => px.sort(() => Math.random() - 0.5);
    const ORDERS = {
        scatter: shuffle,
        scan,
        rain: px => px.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        bloom: (px, g) => { const cx = g[0].length / 2, cy = g.length / 2; return px.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)); },
    };
    const ORDER_NAMES = Object.keys(ORDERS);

    // ---- canvas
    const cv = document.createElement('canvas');
    cv.className = 'glyph-layer';
    cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.querySelector('.grid-layer'));
    const ctx = cv.getContext('2d');

    let colW = 90, rowH = 90, cols = 0, rows = 0, W = 0, H = 0, dpr = 1, P = 4;
    let free = [], freeSet = new Set(), blocks = [];
    const key = (c, r) => c + ',' + r;
    const css = n => getComputedStyle(root).getPropertyValue(n).trim();
    let ink = '#0009ff', bg = '#d9d9d9', line = '#ffffff', band = '#0009ff', onBand = '#ffffff';
    const readColours = () => {
        ink = css('--ink') || ink; bg = css('--bg') || bg; line = css('--line') || line;
        band = css('--band') || band; onBand = css('--on-band') || onBand;
    };

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
        blocks = ['.statement', '.site-header', '.media-cell', '.theme-switch']
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
        const open = pool.filter(i => !used.has(i));
        return open.length ? open[rnd(open.length)] : null;
    }
    const emptyCells = () => free.filter(([c, r]) => !settled.has(key(c, r)) && !reserved.has(key(c, r)));

    // ---- settled glyphs: build up, hold, then leave (dissolve, migrate or lift off)
    function settle(c, r, id, opts = {}) {
        const g = opts.flip ? rot180(icons[id]) : icons[id];
        const order = opts.order || (M.figures ? ORDER_NAMES[rnd(ORDER_NAMES.length)] : 'scatter');
        const px = opts.px || ORDERS[order](pixelsOf(g), g);
        const gl = {
            id, g, px, c, r, shown: opts.shown || 0, phase: 'in',
            rate: Math.max(1, Math.ceil(px.length / rand(M.figures ? 3 : 6, M.figures ? 9 : 14))),
            hold: opts.hold ?? M.hold[0] + rnd(M.hold[1] - M.hold[0]),
            inverse: opts.inverse ?? chance(M.inverse),
        };
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

    // src: absolute pixel positions [x,y] (screen px, top-left of each pixel) and the point they leave from.
    // The pixels nearest the destination peel off first and head for the far side of the target, so the
    // ribbon reads as one body travelling; the journey lasts a whole number of beats and lands on one.
    const BEAT = SIXTEENTH * 4;
    function migrate(src, from, toCell, toId, t0, opts = {}) {
        const [c, r] = toCell, g = icons[toId], p = pxFor(g);
        const ox = Math.round(c * colW + (colW - g[0].length * p) / 2), oy = Math.round(r * rowH + (rowH - g.length * p) / 2);
        const to = cellCentre(c, r);
        const dx = to[0] - from[0], dy = to[1] - from[1], dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
        const proj = ([x, y]) => x * ux + y * uy;
        src = src.slice().sort((a, b) => proj(b) - proj(a));
        const dstPx = pixelsOf(g).sort((a, b) => proj(b) - proj(a));
        const nx = -uy, ny = ux, sign = opts.sign || (chance(0.5) ? 1 : -1), bend = dist * rand(0.35, 0.7) * sign;
        const beats = opts.beats || Math.max(2, Math.round((2400 + dist * 2.2) / BEAT));
        const m = {
            p0: from, p3: to,
            p1: [from[0] + dx * 0.33 + nx * bend, from[1] + dy * 0.33 + ny * bend],
            p2: [from[0] + dx * 0.66 - nx * bend * rand(0.6, 1.2), from[1] + dy * 0.66 - ny * bend * rand(0.6, 1.2)],
            start: t0, dur: beats * BEAT, spread: 0.45,
            src: src.map(([x, y]) => [x - from[0], y - from[1]]),
            dst: dstPx.map(([x, y]) => [ox + x * p - to[0], oy + y * p - to[1]]),
            p, toCell, toId, dstPx, wob: rand(1.2, 2.4), amp: Math.min(colW, rowH) * rand(0.15, 0.3),
            head: [from[0], from[1]], vel: [0, 0],
        };
        reserved.add(key(c, r));
        migrations.push(m);
    }
    function finishMigration(m) {
        reserved.delete(key(...m.toCell));
        if (!freeSet.has(key(...m.toCell))) return;
        const gl = settle(m.toCell[0], m.toCell[1], m.toId, { px: m.dstPx, shown: Math.min(m.src.length, m.dst.length), inverse: false });
        if (gl.shown >= gl.px.length) gl.phase = 'hold';
    }

    const easeInOut = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    function migrationPixels(m, now, out) {
        const tau = (now - m.start) / m.dur;
        const n = Math.max(m.src.length, m.dst.length), pair = Math.min(m.src.length, m.dst.length);
        for (let i = 0; i < m.src.length; i++) {
            const k = i / Math.max(1, m.src.length - 1);
            const delay = Math.pow(k, 1.6) * m.spread;                 // a dense head, a long thin tail
            const u = easeInOut(clamp01((tau - delay) / (1 - m.spread)));
            const [bx, by] = bez(m, u), [tx, ty] = bezT(m, u);
            const mid = Math.sin(Math.PI * u);
            const cohesion = 1 - 0.85 * mid;
            const so = m.src[i], d = m.dst[i < pair ? i : pair - 1] || [0, 0];
            const offx = (so[0] * (1 - u) + d[0] * u) * cohesion, offy = (so[1] * (1 - u) + d[1] * u) * cohesion;
            const w = m.amp * mid * Math.sin(2 * Math.PI * (u * m.wob) + i * 0.25);
            // the tail thins out in flight by dropping pixels, never by fading them: pixel art stays opaque
            const keep = (i >= pair ? 1 - u : 1) * (1 - 0.65 * mid * k);
            if (((i * 0.618034) % 1) < keep) out.push([bx + offx - ty * w, by + offy + tx * w, 1, m.p]);
            if (i === 0) { m.vel = [bx - m.head[0], by - m.head[1]]; m.head = [bx, by]; }
        }
        void n;
        return tau >= 1;
    }

    // ---- drifters: steered through the margins on a smooth field, around the statement
    const field = (x, y, t) => Math.sin(x * 0.0041 + t * 0.00011) + Math.sin(y * 0.0053 - t * 0.00009) + Math.sin((x - y) * 0.0027 + t * 0.00007);
    const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    function lift(gl, now) {
        settled.delete(key(gl.c, gl.r));
        const [x, y] = cellCentre(gl.c, gl.r);
        drifters.push({ id: gl.id, g: gl.g, px: pixelsOf(gl.g), p: pxFor(gl.g), x, y, th: rand(0, 2 * Math.PI), v: rand(0.045, 0.075), t0: now, life: Math.round(rand(14000, 24000) / BEAT) * BEAT, vel: [0, 0], last: now });
    }
    function moveDrifter(d, now) {
        const dt = Math.min(64, now - d.last); d.last = now;
        let target = field(d.x, d.y, now) * Math.PI;
        const m = Math.min(colW, rowH) * 0.7;
        for (const b of blocks) {                                     // keep out of the statement and the header
            const qx = Math.max(b.l, Math.min(d.x, b.r)), qy = Math.max(b.t, Math.min(d.y, b.b));
            const ex = d.x - qx, ey = d.y - qy, dd = Math.hypot(ex, ey);
            if (dd < m) { target = dd > 0.5 ? Math.atan2(ey, ex) : Math.atan2(d.y - (b.t + b.b) / 2, d.x - (b.l + b.r) / 2); break; }
        }
        if (d.x < m || d.x > W - m || d.y < rowH + m * 0.5 || d.y > H - m * 0.5) target = Math.atan2(H / 2 - d.y, W / 2 - d.x);
        d.th += Math.max(-0.0028 * dt, Math.min(0.0028 * dt, angDiff(target, d.th)));
        const vx = Math.cos(d.th) * d.v * dt, vy = Math.sin(d.th) * d.v * dt;
        d.x += vx; d.y += vy; d.vel = [vx, vy];
    }
    function drifterPixels(d) {
        const ox = Math.round(d.x - d.g[0].length * d.p / 2), oy = Math.round(d.y - d.g.length * d.p / 2);
        return d.px.map(([x, y]) => [ox + x * d.p, oy + y * d.p]);
    }
    function landDrifter(d, t0) {
        const e = emptyCells(); if (!e.length) return false;
        let best = e[0], bd = Infinity;
        for (const cell of e) { const [x, y] = cellCentre(...cell), dd = Math.hypot(x - d.x, y - d.y); if (dd < bd) { bd = dd; best = cell; } }
        drifters.splice(drifters.indexOf(d), 1);
        migrate(drifterPixels(d), [d.x, d.y], best, d.id, t0, { beats: 2 });
        return true;
    }

    // ---- the bent grid. Every source (a drifter, a ribbon's head) pushes the lines outward and drags
    // them along its motion. One pass sums all sources; the painted straight line is covered with the
    // ground and redrawn bent, at full strength, so lines stay crisp 1px and only their geometry changes.
    function bendGrid(sources) {
        if (!sources.length) return;
        const S = Math.max(colW, rowH), R0 = 1.1 * S, R = 2.6 * R0, step = 4;
        const disp = (x, y) => {
            let ox = 0, oy = 0;
            for (const s of sources) {
                const dx = x - s.x, dy = y - s.y, r2 = dx * dx + dy * dy;
                if (r2 > R * R) continue;
                const r = Math.sqrt(r2) + 1e-3, f = Math.exp(-r2 / (R0 * R0)) * s.k;
                ox += (dx / r * 0.22 * S + s.vx * 0.5 * S) * f;
                oy += (dy / r * 0.22 * S + s.vy * 0.5 * S) * f;
            }
            return [ox, oy];
        };
        ctx.fillStyle = bg; ctx.strokeStyle = line; ctx.lineWidth = 1;
        const path = new Path2D();
        const run = (vertical, k) => {
            const fixed = vertical ? k * colW : k * rowH;
            let lo = Infinity, hi = -Infinity;
            for (const s of sources) {
                const near = vertical ? Math.abs(s.x - fixed) : Math.abs(s.y - fixed);
                if (near > R) continue;
                const along = vertical ? s.y : s.x;
                lo = Math.min(lo, along - R); hi = Math.max(hi, along + R);
            }
            if (lo > hi) return;
            lo = Math.max(0, lo); hi = Math.min(vertical ? H : W, hi);
            let started = false, a0 = null, a1 = null;
            for (let t = lo; t <= hi + 0.01; t += step) {
                const x = vertical ? fixed : t, y = vertical ? t : fixed, [ox, oy] = disp(x, y);
                const moved = Math.abs(ox) + Math.abs(oy) > 0.25;
                if (moved) { if (a0 === null) a0 = t; a1 = t; }
                if (moved || started) {
                    if (!started) { path.moveTo(x + 0.5, y + 0.5); started = true; }
                    else path.lineTo(x + ox + 0.5, y + oy + 0.5);
                    if (!moved) started = false;
                }
            }
            if (a0 !== null) {                                       // cover the straight line where it moved
                if (vertical) ctx.fillRect(fixed - 0.5, a0 - step, 2, a1 - a0 + 2 * step); else ctx.fillRect(a0 - step, fixed - 0.5, a1 - a0 + 2 * step, 2);
            }
        };
        for (let k = 0; k <= cols; k++) run(true, k);
        for (let k = 1; k <= rows; k++) run(false, k);
        ctx.stroke(path);
    }

    // ---- the calm home's figures (merge): each returns step -> [col, row, opts] requests
    const freeCell = () => { const e = emptyCells(); return e.length ? e[rnd(e.length)] : null; };
    const FIGURES = {
        pulse() { const pat = euclid([3, 5, 7][rnd(3)], 16), rot = rnd(16); return s => (pat[(s + rot) % 16] ? [freeCell()] : []); },
        sweep() {
            const rowsWith = [...new Set(free.map(f => f[1]))], row = rowsWith[rnd(rowsWith.length)];
            let ln = free.filter(f => f[1] === row); if (chance(0.5)) ln = ln.reverse();
            const every = [2, 3][rnd(2)];
            return s => (s % every === 0 && ln[s / every] ? [[...ln[s / every], { order: 'scan', hold: 8 + rnd(12) }]] : []);
        },
        echo(forced) {
            return s => {
                if (s % 8 !== 0) return [];
                const twin = ([c, r]) => [cols - 1 - c, rows - r];
                const pairs = emptyCells().filter(cell => { const t = twin(cell); return freeSet.has(key(...t)) && !settled.has(key(...t)) && key(...t) !== key(...cell); });
                const a = pairs.length ? pairs[rnd(pairs.length)] : null;
                const id = forced != null && s === 0 ? forced : pickId(); if (!a || id == null) return [];
                if (M.unique) {                                        // never two of the same: the answer is another symbol
                    const id2 = pickId(id); if (id2 == null) return [[...a, { id }]];
                    return [[...a, { id }], [cols - 1 - a[0], rows - a[1], { id: id2, delay: 3 }]];
                }
                return [[...a, { id }], [cols - 1 - a[0], rows - a[1], { id, flip: true, delay: 3 }]];
            };
        },
        cluster() {
            return s => {
                if (s % 16 !== 0) return [];
                const a = freeCell(); if (!a) return [];
                const inv = M.inverse > 0 && chance(0.4);
                return [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].slice(0, 3 + rnd(4))
                    .map(([dx, dy], i) => [a[0] + dx, a[1] + dy, { inverse: inv && i % 2 === 0, order: 'bloom', delay: i }]);
            };
        },
        hush() { const at = rnd(32); return s => (s === at ? [freeCell()] : []); },
    };
    const WEIGHTS = [['pulse', 4], ['sweep', 2], ['echo', 2], ['cluster', 2], ['hush', 1]];
    const nextFigure = () => {
        let t = Math.random() * 11;
        for (const [n, w] of WEIGHTS) if ((t -= w) < 0) return FIGURES[n]();
        return FIGURES.pulse();
    };
    let figure = null, pending = [];
    // the piece breathes over sixteen bars: density rises and falls around FILL
    const breath = () => 0.5 - 0.5 * Math.cos(2 * Math.PI * (sixteenth / 32) / 8);
    const onScreenCount = () => settled.size + migrations.length + drifters.length;
    // a slow start: two symbols in the first phrase, one more each phrase after, up to the cap
    const ramp = () => 2 + Math.floor(Math.max(0, sixteenth) / 32);
    const capacity = () => Math.min(M.max, ramp(), Math.max(3, Math.round(free.length * FILL * (0.5 + 0.9 * breath()))));
    function request(c, r, o = {}) {
        if (!freeSet.has(key(c, r)) || settled.has(key(c, r)) || reserved.has(key(c, r))) return;
        if (onScreenCount() >= capacity()) return;
        const id = o.id ?? pickId(); if (id == null) return;
        if (M.unique && inUse().has(id)) return;
        const gl = settle(c, r, id, o);
        if (sixteenth < 32) gl.rate = Math.max(1, Math.ceil(gl.px.length / 16));      // the first glyphs take their time
    }

    // ---- rhythm
    const euclid = (k, n) => { const o = []; for (let i = 0; i < n; i++) o.push(Math.floor((i + 1) * k / n) - Math.floor(i * k / n)); return o; };
    let sixteenth = -M.intro, pattern = euclid(3, 8), nextBeat = 0;
    let hushNext = false;
    function flock(t0) {
        // the holding glyphs leave together, all bending the same way, landing on the same downbeat
        const holding = [...settled.values()].filter(g => g.phase === 'hold').slice(0, 7);
        if (holding.length < 3) return false;
        // a vortex: each glyph heads for the square nearest its own position turned ~110° about the centre
        const sign = chance(0.5) ? 1 : -1, turn = sign * rand(1.6, 2.2), cx = W / 2, cy = H / 2;
        for (const gl of holding) {
            const [x, y] = cellCentre(gl.c, gl.r), a = Math.atan2(y - cy, x - cx) + turn, rad = Math.hypot(x - cx, y - cy);
            const tx = cx + Math.cos(a) * rad, ty = cy + Math.sin(a) * rad;
            const e = emptyCells(), id = pickId(gl.id);
            if (!e.length || id == null) continue;
            let best = e[0], bd = Infinity;
            for (const cell of e) { const [qx, qy] = cellCentre(...cell), d = Math.hypot(qx - tx, qy - ty); if (d < bd) { bd = d; best = cell; } }
            depart(gl, best, id, t0, { sign, beats: 8 });
        }
        return true;
    }
    function depart(gl, cell, id, t0, opts) {
        const p = pxFor(gl.g), ox = Math.round(gl.c * colW + (colW - gl.g[0].length * p) / 2), oy = Math.round(gl.r * rowH + (rowH - gl.g.length * p) / 2);
        const src = gl.px.slice(0, gl.shown).map(([x, y]) => [ox + x * p, oy + y * p]);
        settled.delete(key(gl.c, gl.r));
        migrate(src, cellCentre(gl.c, gl.r), cell, id, t0, opts);
    }

    function onSixteenth(now) {
        if (sixteenth < 0) { sixteenth++; return; }                                   // the opening silence
        const s = sixteenth % 32, phrase = Math.floor(sixteenth / 32);
        if (s === 0) pattern = euclid([2, 3, 5][rnd(3)], [8, 8, 16][rnd(3)]);
        for (const gl of [...settled.values()]) stepSettled(gl);

        const target = capacity();
        if (M.figures) {
            if (s === 0) {
                if (phrase === 0) figure = FIGURES.echo(EYE >= 0 ? EYE : null);         // open on a symbol and its twin (the eye, where allowed)
                else if (hushNext) { figure = FIGURES.hush(); hushNext = false; }
                else if (phrase % 10 === 9 && flock(now)) { figure = FIGURES.hush(); hushNext = true; }
                else figure = nextFigure();
            }
            let hits = figure(s).filter(Boolean).map(h => (h.length === 2 ? [...h, {}] : h));
            if (hits.length && sixteenth > 8 && chance(0.12)) hits = [];                 // a dropped beat (never the opening)
            if (!hits.length && s % 2 === 1 && chance(0.04)) { const f = freeCell(); if (f) hits = [[...f, {}]]; }   // a ghost note
            for (const [c, r, o] of hits) { if (o.delay) pending.push([sixteenth + o.delay, c, r, o]); else request(c, r, o); }
            pending = pending.filter(p => { if (p[0] > sixteenth) return true; request(p[1], p[2], p[3]); return false; });
        } else if (pattern[s % pattern.length] && onScreenCount() < target && chance(0.8)) {
            const e = emptyCells(), id = pickId();
            if (e.length && id != null) { const [c, r] = e[rnd(e.length)]; settle(c, r, id); }
        }
        // a glyph whose time is up waits for the beat, then mostly travels on, sometimes just fades
        if (s % 4 === 0) {
            for (const gl of [...settled.values()]) {
                if (gl.phase !== 'leave') continue;
                if (!chance(M.leave * (0.6 + 0.6 * breath()))) { gl.phase = 'out'; continue; }
                if (drifters.length < MAX_DRIFTERS && chance(0.3)) { lift(gl, now); continue; }
                if (migrations.length >= MAX_MIGRATIONS) { gl.phase = 'out'; continue; }
                const e = emptyCells().filter(([c, r]) => { const d = Math.hypot(c - gl.c, r - gl.r); return d >= 3 && d <= 9; });
                const id = pickId(gl.id);
                if (!e.length || id == null) { gl.phase = 'out'; continue; }
                depart(gl, e[rnd(e.length)], id, now);
            }
        }
        if (s % 4 === 0) for (const d of [...drifters]) if (now - d.t0 >= d.life) landDrifter(d, now);
        sixteenth++;
    }

    // ---- frame
    function drawGlyphAt(gl) {
        const p = pxFor(gl.g), ox = Math.round(gl.c * colW + (colW - gl.g[0].length * p) / 2), oy = Math.round(gl.r * rowH + (rowH - gl.g.length * p) / 2);
        if (gl.inverse) {                                       // a filled square, inset 1px like the site's blocks
            ctx.fillStyle = band; ctx.fillRect(gl.c * colW + 1, gl.r * rowH + 1, colW - 1, rowH - 1);
            ctx.fillStyle = onBand;
        } else ctx.fillStyle = ink;
        for (let i = 0; i < gl.shown; i++) { const [x, y] = gl.px[i]; ctx.fillRect(ox + x * p, oy + y * p, p, p); }
    }
    let painted = false;
    function frame(now) {
        if (!nextBeat) nextBeat = now;
        let n = 0, ticked = false;
        while (now >= nextBeat && n++ < 8) { onSixteenth(nextBeat); nextBeat += SIXTEENTH; ticked = true; }   // events carry their beat's time
        if (now - nextBeat > 1000) nextBeat = now;
        if (!ticked && !drifters.length && !migrations.length && painted) return;   // nothing moves between beats

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const sources = [], flying = [];
        for (const d of drifters) {
            moveDrifter(d, now);
            const sp = Math.hypot(...d.vel) || 1;
            sources.push({ x: d.x, y: d.y, k: 1, vx: d.vel[0] / sp, vy: d.vel[1] / sp });
        }
        for (let i = migrations.length - 1; i >= 0; i--) {
            const m = migrations[i];
            if (migrationPixels(m, now, flying)) { migrations.splice(i, 1); finishMigration(m); continue; }
            const u = clamp01((now - m.start) / m.dur), sp = Math.hypot(...m.vel) || 1;
            sources.push({ x: m.head[0], y: m.head[1], k: 0.3 * Math.sin(Math.PI * u), vx: m.vel[0] / sp, vy: m.vel[1] / sp });
        }
        bendGrid(sources);
        for (const gl of settled.values()) drawGlyphAt(gl);
        ctx.fillStyle = ink;
        for (const [x, y, , p] of flying) ctx.fillRect(Math.round(x), Math.round(y), p, p);
        for (const d of drifters) for (const [x, y] of drifterPixels(d)) ctx.fillRect(x, y, d.p, d.p);
        painted = true;
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
        requestAnimationFrame(() => requestAnimationFrame(() => { queued = false; measure(); painted = false; if (reduced) still(); }));
    };

    readColours(); measure();
    if (reduced) still(); else start();
    window.addEventListener('resize', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    new MutationObserver(() => { readColours(); painted = false; if (reduced) still(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    let onScreen = true;
    const sync = () => { if (reduced) return; (document.hidden || !onScreen) ? stop() : start(); };
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(cv);
})();
