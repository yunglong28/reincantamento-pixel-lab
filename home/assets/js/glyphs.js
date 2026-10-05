/* REINCANTAMENTO — glyph rhythm on the home grid.
   The pixel-lab icons (../src/icons.js) appear inside the squares of the
   background grid on a musical clock. Every two bars the clock picks a new
   figure — a euclidean pulse, a sweep along a row, an echo in the cell rotated
   180° (the eye's own symmetry), a cluster, or near-silence — and a few hits are
   dropped or pushed off the beat so the pattern never settles.

   Two modes, chosen by data-mode on this <script>:
     calm  (index.html) — 104 BPM, sparse, the eye and drop come back often.
     crazy (crazy.html) — 132 BPM with a triplet layer against the sixteenths,
           no symbol on screen twice, 2x2 glyphs, glyphs that walk between
           cells, falling drops that seed a glyph where they land, glitches
           and trails. No full-screen flashes.

   Decorative only: aria-hidden canvas, no pointer events, still frame under
   prefers-reduced-motion, paused while the tab is hidden. */
(() => {
    'use strict';

    const ICONS = window.ICONS;
    if (!ICONS) return;

    const MODES = {
        calm:  { bpm: 104, fill: 0.28, unique: false, brand: 4, trails: 0, big: 0, walkers: 0, drops: 0, glitch: 0, morph: 0.3, hold: [10, 40] },
        crazy: { bpm: 132, fill: 0.5, unique: true, brand: 1, trails: 0.3, big: 0.2, walkers: 3, drops: 0.5, glitch: 0.22, morph: 0.55, hold: [4, 22] },
    };
    const script = document.currentScript;
    const M = MODES[(script && script.dataset.mode) || 'calm'] || MODES.calm;

    // The clock runs in twelfths of a beat: every 3rd is a sixteenth, every 4th a triplet eighth.
    const MICRO_MS = 60000 / M.bpm / 12;
    const PHRASE = 32;                        // sixteenths per figure (two bars)
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rnd = n => Math.floor(Math.random() * n);
    const chance = p => Math.random() < p;

    // ---- icon pool
    const icons = [];                         // unique shapes
    const pool = [];                          // weighted indices into icons
    let DROP = -1;                            // the small brand drop, seeded by falling drops
    for (const set in ICONS) {
        for (const name in ICONS[set]) {
            const rows = ICONS[set][name];
            if (rows.length > 18 || rows[0].length > 18) continue;
            const id = icons.push(rows.map(r => [...r].map(c => c === 'X'))) - 1;
            if (set === 'brand' && name === 'goccia-xs') DROP = id;
            for (let i = 0; i < (set === 'brand' ? M.brand : 1); i++) pool.push(id);
        }
    }

    // ---- canvas, under the statement and the media cell
    const cv = document.createElement('canvas');
    cv.className = 'glyph-layer';
    cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.querySelector('.grid-layer'));
    const ctx = cv.getContext('2d');

    let colW = 90, rowH = 90, cols = 0, rows = 0, dpr = 1, W = 0, H = 0;
    let free = [], freeSet = new Set();
    const glyphs = new Set();                 // live glyphs
    const occ = new Map();                    // "c,r" -> glyph occupying that cell
    const drops = [];                         // falling pixels (crazy)
    const key = (c, r) => c + ',' + r;

    const css = name => getComputedStyle(root).getPropertyValue(name).trim();
    let ink = '#0009ff', band = '#0009ff', onBand = '#ffffff', line = '#ffffff';
    const readColours = () => { ink = css('--ink') || ink; band = css('--band') || band; onBand = css('--on-band') || onBand; line = css('--line') || line; };

    function measure() {
        colW = parseFloat(css('--grid-col')) || 90;
        rowH = parseFloat(css('--grid-row')) || 90;
        H = parseFloat(css('--screen-h')) || window.innerHeight;
        W = root.clientWidth;
        cols = Math.round(W / colW); rows = Math.round(H / rowH);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.style.height = H + 'px';
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

        // cells covered by anything on the first screen stay empty
        const blocks = ['.statement', '.site-header', '.media-cell', '.theme-switch']
            .map(s => document.querySelector(s)).filter(Boolean)
            .map(el => el.getBoundingClientRect())
            .map(b => ({ l: b.left, t: b.top + window.scrollY, r: b.right, b: b.bottom + window.scrollY }));
        free = [];
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
            const x0 = c * colW + 2, y0 = r * rowH + 2, x1 = (c + 1) * colW - 2, y1 = (r + 1) * rowH - 2;
            if (blocks.some(b => x0 < b.r && x1 > b.l && y0 < b.b && y1 > b.t)) continue;
            free.push([c, r]);
        }
        freeSet = new Set(free.map(([c, r]) => key(c, r)));
        for (const gl of [...glyphs]) if (gl.cells.some(([c, r]) => !freeSet.has(key(c, r)))) remove(gl);
        drops.length = 0;
    }

    // ---- choosing shapes
    const inUse = () => new Set([...glyphs].map(g => g.id));
    function pickId(not) {
        if (!M.unique) return pool[rnd(pool.length)];
        const used = inUse(); if (not != null) used.add(not);
        const open = pool.filter(id => !used.has(id));
        return open.length ? open[rnd(open.length)] : null;
    }

    // ---- glyph lifecycle
    const ORDERS = {
        scatter: px => px.sort(() => Math.random() - 0.5),
        scan: px => px.sort((a, b) => a[1] - b[1] || a[0] - b[0]),
        rain: px => px.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        bloom: (px, g) => { const cx = g[0].length / 2, cy = g.length / 2; return px.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)); },
    };
    const ORDER_NAMES = Object.keys(ORDERS);
    const anyOrder = () => ORDER_NAMES[rnd(ORDER_NAMES.length)];
    const pixelsOf = g => { const p = []; g.forEach((row, y) => row.forEach((v, x) => { if (v) p.push([x, y]); })); return p; };
    const rot180 = g => g.slice().reverse().map(r => r.slice().reverse());

    function cellsFor(c, r, span) { const out = []; for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) out.push([c + dx, r + dy]); return out; }
    const canPlace = (cells, self) => cells.every(([c, r]) => freeSet.has(key(c, r)) && (!occ.has(key(c, r)) || occ.get(key(c, r)) === self));

    function remove(gl) { glyphs.delete(gl); for (const [c, r] of gl.cells) if (occ.get(key(c, r)) === gl) occ.delete(key(c, r)); }

    function spawn(c, r, opts = {}) {
        const span = opts.span || 1;
        const cells = cellsFor(c, r, span);
        if (!canPlace(cells, opts.replace)) return null;
        const id = opts.id ?? pickId(); if (id == null) return null;
        if (opts.replace) remove(opts.replace);
        const g = opts.flip ? rot180(icons[id]) : icons[id];
        const px = ORDERS[opts.order || anyOrder()](pixelsOf(g), g);
        const gl = {
            id, g, px, c, r, span, cells, shown: 0,
            inverse: opts.inverse ?? chance(0.12),
            rate: Math.max(2, Math.ceil(px.length / (2 + rnd(6)))),
            hold: opts.hold ?? M.hold[0] + rnd(M.hold[1] - M.hold[0]),
            phase: 'in',
            morph: chance(M.morph),
            walker: !!opts.walker,
            glitch: 0,
        };
        glyphs.add(gl); for (const [x, y] of cells) occ.set(key(x, y), gl);
        return gl;
    }

    function stepGlyph(gl) {
        if (gl.glitch > 0) gl.glitch--;
        else if (M.glitch && gl.phase === 'hold' && chance(M.glitch / 6)) gl.glitch = 1 + rnd(3);
        if (gl.phase === 'in') {
            gl.shown = Math.min(gl.px.length, gl.shown + gl.rate);
            if (gl.shown === gl.px.length) gl.phase = 'hold';
        } else if (gl.phase === 'hold') {
            if (gl.walker) return;                 // walkers leave on their own clock
            if (--gl.hold <= 0) {
                if (gl.morph) {
                    const id = pickId(gl.id);
                    if (id != null && spawn(gl.c, gl.r, { id, span: gl.span, inverse: gl.inverse, order: 'scatter', replace: gl })) return;
                }
                gl.phase = 'out'; gl.px = ORDERS[anyOrder()](gl.px.slice(0, gl.shown), gl.g);
            }
        } else {
            gl.shown = Math.max(0, gl.shown - gl.rate);
            if (!gl.shown) remove(gl);
        }
    }

    // walkers hop to a free neighbour on the triplet clock and wear out
    function stepWalker(gl) {
        if (gl.phase !== 'hold') return;
        if (--gl.hold <= 0) { gl.walker = false; gl.phase = 'out'; return; }
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [gl.c + dx, gl.r + dy])
            .filter(([c, r]) => canPlace([[c, r]], gl));
        if (!n.length) return;
        const [c, r] = n[rnd(n.length)];
        remove(gl); gl.c = c; gl.r = r; gl.cells = [[c, r]];
        glyphs.add(gl); occ.set(key(c, r), gl);
    }

    // ---- figures: each returns step -> list of [col, row, opts]
    const euclid = (k, n) => { const out = []; for (let i = 0; i < n; i++) out.push(Math.floor((i + 1) * k / n) - Math.floor(i * k / n)); return out; };
    const emptyCells = () => free.filter(([c, r]) => !occ.has(key(c, r)));
    const freeCell = () => { const e = emptyCells(); return e.length ? e[rnd(e.length)] : null; };
    const room = () => glyphs.size < Math.max(3, free.length * M.fill);
    const bigCell = () => {
        const e = emptyCells().filter(([c, r]) => canPlace(cellsFor(c, r, 2)));
        return e.length ? e[rnd(e.length)] : null;
    };

    const FIGURES = {
        pulse() {
            const pat = euclid([3, 5, 7][rnd(3)], 16), rot = rnd(16);
            return s => (pat[(s + rot) % 16] ? [freeCell()] : []);
        },
        sweep() {
            const rowsWith = [...new Set(free.map(f => f[1]))];
            const row = rowsWith[rnd(rowsWith.length)];
            let line = free.filter(f => f[1] === row);
            if (chance(0.5)) line = line.reverse();
            const id = M.unique ? undefined : pickId(), every = [2, 3][rnd(2)];
            return s => (s % every === 0 && line[s / every] ? [[...line[s / every], { id, order: 'scan', hold: 6 + rnd(10) }]] : []);
        },
        echo() {
            // a glyph and its twin rotated, in the cell rotated 180° about the screen
            return s => {
                if (s % 8 !== 0) return [];
                const a = freeCell(); if (!a) return [];
                const b = [cols - 1 - a[0], rows - a[1]];
                const id = M.unique ? undefined : pickId();
                return [[...a, { id }], [...b, { id, flip: true, delay: 3 }]];
            };
        },
        cluster() {
            return s => {
                if (s % 16 !== 0) return [];
                const a = freeCell(); if (!a) return [];
                const id = M.unique ? undefined : pickId(), inv = chance(0.4);
                return [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].slice(0, 3 + rnd(4))
                    .map(([dx, dy], i) => [a[0] + dx, a[1] + dy, { id, inverse: inv && i % 2 === 0, order: 'bloom', delay: i }]);
            };
        },
        hush() {
            const at = rnd(PHRASE);
            return s => (s === at ? [freeCell()] : []);
        },
        giant() {
            // crazy only: a 2x2 glyph on the downbeat, a scatter of small ones after it
            const pat = euclid(5, 16);
            return s => {
                if (s === 0) { const b = bigCell(); return b ? [[...b, { span: 2, order: 'bloom', hold: 20 + rnd(20) }]] : []; }
                return pat[s % 16] ? [freeCell()] : [];
            };
        },
    };
    const WEIGHTS = M.big
        ? [['pulse', 3], ['sweep', 2], ['echo', 2], ['cluster', 2], ['giant', 3], ['hush', 1]]
        : [['pulse', 4], ['sweep', 2], ['echo', 2], ['cluster', 2], ['hush', 1]];
    const nextFigure = () => {
        let t = Math.random() * WEIGHTS.reduce((a, w) => a + w[1], 0);
        for (const [n, w] of WEIGHTS) { if ((t -= w) < 0) return FIGURES[n](); }
        return FIGURES.pulse();
    };

    // ---- clock
    let micro = 0, sixteenth = 0, figure = null, pending = [];
    const place = (c, r, o) => { if (room()) spawn(c, r, o); };

    function onSixteenth() {
        const s = sixteenth % PHRASE;
        if (s === 0) figure = nextFigure();
        let hits = figure(s).filter(Boolean).map(h => (h.length === 2 ? [...h, {}] : h));
        if (hits.length && chance(0.12)) hits = [];                                     // a dropped beat
        if (!hits.length && s % 2 === 1 && chance(M.big ? 0.12 : 0.04)) {                 // a ghost note
            const f = freeCell(); if (f) hits = [[...f, {}]];
        }
        for (const [c, r, o] of hits) {
            if (o.delay) pending.push([sixteenth + o.delay, c, r, o]); else place(c, r, o);
        }
        pending = pending.filter(p => { if (p[0] > sixteenth) return true; place(p[1], p[2], p[3]); return false; });
        for (const gl of [...glyphs]) stepGlyph(gl);
        sixteenth++;
    }

    function onTriplet() {
        // walkers: keep a few on screen, each hopping on the off-grid pulse
        if (M.walkers) {
            const walking = [...glyphs].filter(g => g.walker);
            if (walking.length < M.walkers && chance(0.15)) { const f = freeCell(); if (f) spawn(f[0], f[1], { walker: true, hold: 12 + rnd(24), inverse: chance(0.3) }); }
            for (const gl of walking) if (chance(0.6)) stepWalker(gl);
        }
        // drops: fall down a column, seed a glyph where they stop
        if (M.drops && chance(M.drops / 3) && drops.length < 6) {
            drops.push({ c: rnd(cols), y: rowH + rnd(rowH), v: 6 + rnd(10), stop: 1 + rnd(rows - 1) });
        }
    }

    function stepDrops() {
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.y += d.v; d.v *= 1.04;
            const r = Math.floor(d.y / rowH);
            if (r >= rows || (r >= d.stop && freeSet.has(key(d.c, r)) && !occ.has(key(d.c, r)))) {
                if (r < rows) spawn(d.c, r, { order: 'bloom', id: chance(0.3) && DROP >= 0 && !inUse().has(DROP) ? DROP : undefined });
                drops.splice(i, 1);
            }
        }
    }

    // ---- drawing
    function drawGlyph(gl) {
        const x = gl.c * colW, y = gl.r * rowH, cw = colW * gl.span, ch = rowH * gl.span;
        const gw = gl.g[0].length, gh = gl.g.length;
        const p = Math.max(1, Math.floor(Math.min(cw, ch) * 0.62 / Math.max(gw, gh)));
        const ox = Math.round(x + (cw - gw * p) / 2), oy = Math.round(y + (ch - gh * p) / 2);
        if (gl.inverse) { ctx.fillStyle = band; ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1); }   // the site's 1px inset
        const shift = gl.glitch ? (rnd(2) ? 1 : -1) * p * (1 + rnd(2)) : 0, cut = gl.glitch ? rnd(gh) : -1;
        if (gl.glitch) {                                       // a ghost copy, a pixel off, in the grid-line colour
            ctx.fillStyle = gl.inverse ? ink : line;
            for (let i = 0; i < gl.shown; i++) { const [px, py] = gl.px[i]; ctx.fillRect(ox + px * p + p, oy + py * p, p, p); }
        }
        ctx.fillStyle = gl.inverse ? onBand : ink;
        for (let i = 0; i < gl.shown; i++) {
            const [px, py] = gl.px[i];
            ctx.fillRect(ox + px * p + (cut >= 0 && py >= cut ? shift : 0), oy + py * p, p, p);
        }
    }

    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (M.trails) {                                         // let the last frame fade instead of wiping it
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = `rgba(0,0,0,${1 - M.trails})`; ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
        } else ctx.clearRect(0, 0, W, H);
        for (const gl of glyphs) drawGlyph(gl);
        ctx.fillStyle = ink;
        const s = Math.max(3, Math.round(colW / 16));
        for (const d of drops) ctx.fillRect(Math.round(d.c * colW + colW / 2 - s / 2), Math.round(d.y), s, s * 2);
    }

    // A drift-corrected timeout clock: nothing changes between ticks, so nothing is drawn there.
    let timer = 0, next = 0;
    function microTick() {
        const beat = micro % 3 === 0 || micro % 4 === 0;
        if (micro % 3 === 0) onSixteenth();
        if (micro % 4 === 0) onTriplet();
        const falling = drops.length > 0;
        if (falling) stepDrops();
        micro++;
        return beat || falling;
    }
    function run() {
        const now = performance.now();
        if (!next || now - next > 1000) next = now;            // first start, or back from a hidden tab
        let n = 0, dirty = false;
        while (next <= now && n < 12) { dirty = microTick() || dirty; next += MICRO_MS; n++; }
        if (dirty) draw();
        timer = setTimeout(run, Math.max(0, next - performance.now()));
    }
    const start = () => { if (!timer) { next = 0; run(); } };
    const stop = () => { clearTimeout(timer); timer = 0; };

    function still() {
        for (const gl of [...glyphs]) remove(gl);
        for (let i = 0; i < Math.min(9, Math.floor(free.length * 0.2)); i++) {
            const c = freeCell(); if (!c) break;
            const gl = spawn(c[0], c[1], { hold: Infinity }); if (!gl) continue;
            gl.shown = gl.px.length; gl.phase = 'hold'; gl.morph = false;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        for (const gl of glyphs) drawGlyph(gl);
    }

    let queued = false;
    const refit = () => {
        if (queued) return; queued = true;
        requestAnimationFrame(() => requestAnimationFrame(() => { queued = false; measure(); reduced ? still() : draw(); }));
    };

    readColours(); measure();
    if (reduced) still(); else start();

    window.addEventListener('resize', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    new MutationObserver(() => { readColours(); reduced ? still() : draw(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', () => { if (!reduced) (document.hidden ? stop() : start()); });
})();
