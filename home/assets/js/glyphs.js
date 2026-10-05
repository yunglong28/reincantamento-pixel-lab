/* REINCANTAMENTO — glyph rhythm on the home grid.
   The pixel-lab icons (../src/icons.js) appear inside the squares of the
   background grid, on a 16-step clock. Every two bars the clock picks a new
   figure — a euclidean pulse, a sweep along a row, an echo in the cell rotated
   180° (the eye's own symmetry), a cluster, or near-silence — and a few hits are
   dropped or pushed off the beat so the pattern never settles.
   Glyphs build up pixel by pixel, hold, then dissolve or turn into another.
   Decorative only: aria-hidden canvas, no pointer events, still frame under
   prefers-reduced-motion, paused while the tab is hidden. */
(() => {
    'use strict';

    const ICONS = window.ICONS;
    if (!ICONS) return;

    const BPM = 104;
    const STEP_MS = 60000 / BPM / 4;          // one sixteenth
    const PHRASE = 32;                        // steps per figure (two bars)
    const FILL_RATIO = 0.28;                  // never more than this share of free cells lit
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- icon pool: every set, the brand eye and drop weighted up
    const pool = [];
    for (const set in ICONS) {
        for (const name in ICONS[set]) {
            const rows = ICONS[set][name];
            if (rows.length > 18 || rows[0].length > 18) continue;
            const g = rows.map(r => [...r].map(c => c === 'X'));
            const w = (set === 'brand') ? 4 : 1;
            for (let i = 0; i < w; i++) pool.push(g);
        }
    }
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    const rnd = n => Math.floor(Math.random() * n);
    const chance = p => Math.random() < p;

    // ---- canvas, under the statement and the media cell
    const cv = document.createElement('canvas');
    cv.className = 'glyph-layer';
    cv.setAttribute('aria-hidden', 'true');
    const layer = document.querySelector('.grid-layer');
    document.body.insertBefore(cv, layer || null);
    const ctx = cv.getContext('2d');

    let colW = 90, rowH = 90, cols = 0, rows = 0, dpr = 1;
    let free = [];                 // [col,row] cells a glyph may use
    let freeSet = new Set();
    const live = new Map();        // "c,r" -> glyph
    const key = (c, r) => c + ',' + r;

    const css = name => getComputedStyle(root).getPropertyValue(name).trim();
    let ink = '#0009ff', band = '#0009ff', onBand = '#ffffff';
    const readColours = () => { ink = css('--ink') || ink; band = css('--band') || band; onBand = css('--on-band') || onBand; };

    function measure() {
        colW = parseFloat(css('--grid-col')) || 90;
        rowH = parseFloat(css('--grid-row')) || 90;
        const h = parseFloat(css('--screen-h')) || window.innerHeight;
        const w = root.clientWidth;
        cols = Math.round(w / colW); rows = Math.round(h / rowH);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.style.height = h + 'px';
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);

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
        for (const k of [...live.keys()]) if (!freeSet.has(k)) live.delete(k);
    }

    // ---- glyphs
    const ORDERS = {
        scatter: px => px.sort(() => Math.random() - 0.5),
        scan: px => px.sort((a, b) => a[1] - b[1] || a[0] - b[0]),
        rain: px => px.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        bloom: (px, g) => { const cx = g[0].length / 2, cy = g.length / 2; return px.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)); },
    };
    const ORDER_NAMES = Object.keys(ORDERS);
    const pixelsOf = g => { const p = []; g.forEach((row, y) => row.forEach((v, x) => { if (v) p.push([x, y]); })); return p; };

    function spawn(c, r, g, opts = {}) {
        const k = key(c, r);
        if (!freeSet.has(k) || (live.has(k) && !opts.replace)) return false;
        g = g || pick();
        const order = opts.order || ORDER_NAMES[rnd(ORDER_NAMES.length)];
        const px = ORDERS[order](pixelsOf(g), g);
        live.set(k, {
            c, r, g, px, shown: 0,
            inverse: opts.inverse ?? chance(0.12),
            rate: opts.rate || Math.max(2, Math.ceil(px.length / (2 + rnd(6)))),   // pixels per step
            hold: opts.hold ?? 10 + rnd(30),
            phase: 'in',
            morph: chance(0.3),
        });
        return true;
    }

    function stepGlyph(gl) {
        if (gl.phase === 'in') {
            gl.shown = Math.min(gl.px.length, gl.shown + gl.rate);
            if (gl.shown === gl.px.length) gl.phase = 'hold';
        } else if (gl.phase === 'hold') {
            if (--gl.hold <= 0) {
                if (gl.morph) { spawn(gl.c, gl.r, pick(), { inverse: gl.inverse, order: 'scatter', replace: true }); return; }
                gl.phase = 'out'; gl.px = ORDERS[ORDER_NAMES[rnd(ORDER_NAMES.length)]](gl.px.slice(0, gl.shown), gl.g);
            }
        } else {
            gl.shown = Math.max(0, gl.shown - gl.rate);
            if (!gl.shown) live.delete(key(gl.c, gl.r));
        }
    }

    // ---- figures: each returns a function step -> list of spawns
    const euclid = (k, n) => { const out = []; for (let i = 0; i < n; i++) out.push(Math.floor((i + 1) * k / n) - Math.floor(i * k / n)); return out; };
    const freeCell = () => { const empty = free.filter(([c, r]) => !live.has(key(c, r))); return empty.length ? empty[rnd(empty.length)] : null; };
    const room = () => live.size < Math.max(3, free.length * FILL_RATIO);

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
            const g = pick(), every = [2, 3][rnd(2)];
            return s => (s % every === 0 && line[s / every] ? [[...line[s / every], g, { order: 'scan', hold: 6 + rnd(10) }]] : []);
        },
        echo() {
            // a glyph, then its twin in the cell rotated 180° about the screen centre, on the off-beat
            return s => {
                if (s % 8 === 0) {
                    const a = freeCell(); if (!a) return [];
                    const g = pick();
                    const b = [cols - 1 - a[0], rows - a[1]];
                    return [[...a, g], [...b, g.slice().reverse().map(r => r.slice().reverse()), { delay: 3 }]];
                }
                return [];
            };
        },
        cluster() {
            return s => {
                if (s % 16 !== 0) return [];
                const a = freeCell(); if (!a) return [];
                const g = pick(), inv = chance(0.4);
                return [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].slice(0, 3 + rnd(4))
                    .map(([dx, dy], i) => [a[0] + dx, a[1] + dy, g, { inverse: inv && i % 2 === 0, order: 'bloom', delay: i }]);
            };
        },
        hush() {
            const at = rnd(PHRASE);
            return s => (s === at ? [freeCell()] : []);
        },
    };
    const WEIGHTS = [['pulse', 4], ['sweep', 2], ['echo', 2], ['cluster', 2], ['hush', 1]];
    const nextFigure = () => {
        let t = Math.random() * WEIGHTS.reduce((a, w) => a + w[1], 0);
        for (const [n, w] of WEIGHTS) { if ((t -= w) < 0) return FIGURES[n](); }
        return FIGURES.pulse();
    };

    // ---- clock
    let step = 0, figure = null, pending = [];
    function tick() {
        const s = step % PHRASE;
        if (s === 0) figure = nextFigure();
        let hits = figure(s).filter(Boolean);
        if (hits.length && chance(0.12)) hits = [];                     // a dropped beat
        if (!hits.length && s % 2 === 1 && chance(0.04)) hits = [freeCell()].filter(Boolean);  // a ghost note
        for (const h of hits) {
            const [c, r, g, o = {}] = h;
            if (o.delay) pending.push([step + o.delay, c, r, g, o]); else if (room()) spawn(c, r, g, o);
        }
        pending = pending.filter(p => { if (p[0] > step) return true; if (room()) spawn(p[1], p[2], p[3], p[4]); return false; });
        for (const gl of [...live.values()]) stepGlyph(gl);
        step++;
    }

    // ---- drawing
    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (const gl of live.values()) {
            const x = gl.c * colW, y = gl.r * rowH;
            const gw = gl.g[0].length, gh = gl.g.length;
            const p = Math.max(1, Math.floor(Math.min(colW, rowH) * 0.62 / Math.max(gw, gh)));
            const ox = Math.round(x + (colW - gw * p) / 2), oy = Math.round(y + (rowH - gh * p) / 2);
            if (gl.inverse) { ctx.fillStyle = band; ctx.fillRect(x + 1, y + 1, colW - 1, rowH - 1); }   // the site's 1px inset
            ctx.fillStyle = gl.inverse ? onBand : ink;
            for (let i = 0; i < gl.shown; i++) { const [px, py] = gl.px[i]; ctx.fillRect(ox + px * p, oy + py * p, p, p); }
        }
    }

    // ---- run
    // A drift-corrected timeout clock: the page only changes on a sixteenth, so
    // there is nothing to draw between ticks.
    let timer = 0, next = 0;
    function run() {
        const now = performance.now();
        if (!next || now - next > 1000) next = now;      // first start, or back from a hidden tab
        let n = 0;
        while (next <= now && n < 4) { tick(); next += STEP_MS; n++; }
        draw();
        timer = setTimeout(run, Math.max(0, next - performance.now()));
    }
    const start = () => { if (!timer) { next = 0; run(); } };
    const stop = () => { clearTimeout(timer); timer = 0; };

    function still() {
        live.clear();
        for (let i = 0; i < Math.min(9, Math.floor(free.length * 0.2)); i++) {
            const c = freeCell(); if (!c) break;
            spawn(c[0], c[1]); const gl = live.get(key(c[0], c[1])); gl.shown = gl.px.length; gl.phase = 'hold'; gl.hold = Infinity;
        }
        draw();
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
    new MutationObserver(() => { readColours(); draw(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', () => {
        if (reduced) return;
        document.hidden ? stop() : start();
    });
})();
