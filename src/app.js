(function () {
  const { toGrid, toRows, neighbours, lint, staircase, svgOf, drawTo } = window.Grid;
  const BLUE = '#0000FF', GREY = '#D9D9D9', WARN = '#C24A00';
  // Grid modules measured on the brand SVGs (pt): logo.svg 77.95/16, Asset 3.svg 68.95/8.
  const MODULE = { eye: 4.872, drop: 8.619, unit: 1 };
  const LOCKED = 'brand';
  const ORIG = window.ICONS;
  const KEY = 'pixel-lab-v2';
  const $ = id => document.getElementById(id);

  let DATA = JSON.parse(JSON.stringify(ORIG));
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const p = JSON.parse(s); for (const st in p) for (const k in p[st]) (DATA[st] = DATA[st] || {})[k] = p[st][k]; }
  } catch (e) {}

  let curSet = Object.keys(DATA)[0], curName = Object.keys(DATA[curSet])[0];
  let grid = [], undo = [], redo = [], sym = 'none', ink = BLUE, mod = 'eye';
  const W = () => grid[0].length, H = () => grid.length;
  const msg = t => { $('msg').textContent = t; };

  function save() {
    DATA[curSet][curName] = toRows(grid);
    try {
      const diff = {};
      for (const st in DATA) for (const k in DATA[st]) {
        if (!ORIG[st] || JSON.stringify(DATA[st][k]) !== JSON.stringify(ORIG[st][k])) (diff[st] = diff[st] || {})[k] = DATA[st][k];
      }
      localStorage.setItem(KEY, JSON.stringify(diff));
    } catch (e) {}
  }
  function push() { undo.push(JSON.stringify(grid)); if (undo.length > 120) undo.shift(); redo = []; }
  const isClean = li => !li.orph.length && !li.diag.length;

  // ------------------------------------------------------------ library
  function renderSets() {
    const s = $('set'); s.innerHTML = '';
    for (const st of Object.keys(DATA)) {
      const o = document.createElement('option'); o.value = st;
      o.textContent = `${st}  (${Object.keys(DATA[st]).length})`; o.selected = st === curSet; s.appendChild(o);
    }
  }
  $('set').onchange = e => { curSet = e.target.value; curName = Object.keys(DATA[curSet])[0]; load(); };

  function renderList() {
    const L = $('list'); L.innerHTML = '';
    for (const k of Object.keys(DATA[curSet])) {
      const g = toGrid(DATA[curSet][k]);
      const b = document.createElement('button'); b.className = 'card' + (k === curName ? ' sel' : '');
      b.title = k;
      const cv = document.createElement('canvas'); drawTo(cv, g, 4, BLUE);
      const n = document.createElement('span'); n.className = 'nm'; n.textContent = k;
      b.append(cv, n);
      if (!isClean(lint(g)) && curSet !== LOCKED) { const d = document.createElement('span'); d.className = 'dot'; d.title = 'Fuori dalla grammatica del logo'; b.appendChild(d); }
      b.onclick = () => { curName = k; load(); };
      L.appendChild(b);
    }
  }

  // ------------------------------------------------------------ inspector
  function renderInspector() {
    const li = lint(grid), clean = isClean(li);
    const issues = [];
    if (li.diag.length) issues.push(`${li.diag.length} ${li.diag.length === 1 ? 'pixel tocca' : 'pixel toccano'} solo in diagonale`);
    if (li.orph.length) issues.push(`${li.orph.length} ${li.orph.length === 1 ? 'pixel isolato' : 'pixel isolati'}`);
    $('check').innerHTML = clean
      ? '<div class="status ok">Conforme al logo</div><ul><li>Gradini sovrapposti, nessun pixel isolato.</li></ul>'
      : `<div class="status bad">Da correggere</div><ul>${issues.map(t => `<li>${t}</li>`).join('')}</ul>`;
    $('fix').disabled = clean;

    const P = $('prev'); P.innerHTML = '';
    const tiles = [[1, GREY, BLUE], [2, GREY, BLUE], [3, BLUE, GREY]];
    if ($('showref').checked) for (const k of ['occhio', 'goccia']) tiles.push([3, GREY, BLUE, toGrid(ORIG.brand[k])]);
    for (const [s, bg, col, g] of tiles) {
      const d = document.createElement('div'); d.style.background = bg;
      const cv = document.createElement('canvas'); drawTo(cv, g || grid, s, col); d.appendChild(cv); P.appendChild(d);
    }
    const m = MODULE[mod];
    $('meta').innerHTML =
      `<dt>Griglia</dt><dd>${W()} × ${H()}</dd>` +
      `<dt>Misura SVG</dt><dd>${(W() * m).toFixed(2)} × ${(H() * m).toFixed(2)} pt</dd>` +
      `<dt>Pixel</dt><dd>${li.ink} · ${(li.density * 100).toFixed(0)}%</dd>` +
      `<dt>Simmetria</dt><dd>${li.mirror ? 'speculare' : li.rot ? '180°' : '—'}</dd>`;

    $('name').innerHTML = `${curName} <small>· ${curSet}</small>`;
    $('lock').hidden = curSet !== LOCKED;
  }
  $('showref').onchange = renderInspector;
  $('marks').onchange = () => draw();

  // ------------------------------------------------------------ canvas
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cs = 24;
  function fit() {
    const box = document.querySelector('.canvaswrap');
    const maxW = Math.max(160, box.clientWidth - 48), maxH = Math.max(160, Math.min(640, box.clientHeight - 48 || 560));
    cs = Math.max(8, Math.min(48, Math.floor(Math.min(maxW / W(), maxH / H()))));
    cv.width = W() * cs; cv.height = H() * cs; draw();
  }
  function draw() {
    ctx.fillStyle = GREY; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = BLUE;
    for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) if (grid[y][x]) ctx.fillRect(x * cs, y * cs, cs, cs);
    ctx.strokeStyle = 'rgba(22,22,58,.14)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < W(); x++) { ctx.moveTo(x * cs + .5, 0); ctx.lineTo(x * cs + .5, H() * cs); }
    for (let y = 1; y < H(); y++) { ctx.moveTo(0, y * cs + .5); ctx.lineTo(W() * cs, y * cs + .5); }
    ctx.stroke();
    ctx.strokeStyle = WARN; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    if (sym === 'mirror') { ctx.beginPath(); ctx.moveTo(W() * cs / 2, 0); ctx.lineTo(W() * cs / 2, H() * cs); ctx.stroke(); }
    ctx.setLineDash([]);
    if (sym === 'rot') { ctx.beginPath(); ctx.arc(W() * cs / 2, H() * cs / 2, 6, 0, 7); ctx.stroke(); }
    if (!$('marks').checked) return;
    const li = lint(grid);
    ctx.lineWidth = 3;
    for (const [x, y] of li.orph) ctx.strokeRect(x * cs + 3, y * cs + 3, cs - 6, cs - 6);
    ctx.lineWidth = 2;
    for (const [x, y] of li.diag) { ctx.beginPath(); ctx.arc((x + 1) * cs, (y + 1) * cs, cs / 3, 0, 7); ctx.stroke(); }
  }
  let painting = null;
  const cellAt = e => {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * (cv.width / r.width) / cs), y = Math.floor((e.clientY - r.top) * (cv.height / r.height) / cs);
    return x >= 0 && y >= 0 && x < W() && y < H() ? [x, y] : null;
  };
  const paint = ([x, y]) => {
    grid[y][x] = painting;
    if (sym === 'mirror') grid[y][W() - 1 - x] = painting;
    if (sym === 'rot') grid[H() - 1 - y][W() - 1 - x] = painting;
    draw();
  };
  cv.addEventListener('pointerdown', e => {
    const c = cellAt(e); if (!c) return;
    cv.setPointerCapture(e.pointerId); push(); painting = grid[c[1]][c[0]] ? 0 : 1; paint(c); e.preventDefault();
  });
  cv.addEventListener('pointermove', e => { if (painting === null) return; const c = cellAt(e); if (c) paint(c); });
  const end = () => { if (painting !== null) { painting = null; refresh(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  window.addEventListener('resize', fit);

  function refresh() { save(); renderInspector(); renderList(); draw(); }
  function load() { grid = toGrid(DATA[curSet][curName]); undo = []; redo = []; renderSets(); renderList(); renderInspector(); fit(); msg(''); }

  // ------------------------------------------------------------ operations
  const blankRow = () => grid[0].map(() => 0);
  const OPS = {
    undo() { if (undo.length) { redo.push(JSON.stringify(grid)); grid = JSON.parse(undo.pop()); } },
    redo() { if (redo.length) { undo.push(JSON.stringify(grid)); grid = JSON.parse(redo.pop()); } },
    reset() { push(); grid = toGrid(ORIG[curSet]?.[curName] || DATA[curSet][curName]); },
    // Same as tools/build_icons.py: isolated pixels become 2x1 marks, diagonal joins become steps.
    fix() {
      push(); const li = lint(grid);
      for (const [x, y] of li.orph) { if (x + 1 < W() && !grid[y][x + 1]) grid[y][x + 1] = 1; else if (x > 0) grid[y][x - 1] = 1; }
      grid = staircase(grid);
      msg(`Corretti ${li.diag.length + li.orph.length} punti.`);
    },
    flipH() { push(); grid = grid.map(r => r.slice().reverse()); },
    flipV() { push(); grid = grid.slice().reverse(); },
    rot180() { push(); grid = grid.slice().reverse().map(r => r.slice().reverse()); },
    outline() { push(); const g = grid; grid = g.map((r, y) => r.map((v, x) => (v && neighbours(g, x, y)[0] < 4 ? 1 : 0))); },
    fill() {
      push(); const h = H(), w = W(), out = grid.map(r => r.map(() => 0)), st = [];
      for (let x = 0; x < w; x++) st.push([x, 0], [x, h - 1]);
      for (let y = 0; y < h; y++) st.push([0, y], [w - 1, y]);
      while (st.length) {
        const [x, y] = st.pop();
        if (x < 0 || y < 0 || x >= w || y >= h || out[y][x] || grid[y][x]) continue;
        out[y][x] = 1; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      grid = grid.map((r, y) => r.map((v, x) => (out[y][x] ? 0 : 1)));
    },
    dither() { push(); const g = grid; grid = g.map((r, y) => r.map((v, x) => (v && (neighbours(g, x, y)[0] < 4 || (x + y) % 2 === 0) ? 1 : 0))); },
    invert() { push(); grid = grid.map(r => r.map(v => (v ? 0 : 1))); },
    L() { push(); grid = grid.map(r => [...r.slice(1), 0]); },
    R() { push(); grid = grid.map(r => [0, ...r.slice(0, -1)]); },
    U() { push(); grid = [...grid.slice(1), blankRow()]; },
    D() { push(); grid = [blankRow(), ...grid.slice(0, -1)]; },
    addC() { push(); grid = grid.map(r => [0, ...r, 0]); },
    remC() { if (W() > 3) { push(); grid = grid.map(r => r.slice(1, -1)); } },
    addR() { push(); grid = [blankRow(), ...grid, blankRow()]; },
    remR() { if (H() > 3) { push(); grid = grid.slice(1, -1); } },
    trim() {
      let x0 = W(), x1 = -1, y0 = H(), y1 = -1;
      grid.forEach((r, y) => r.forEach((v, x) => { if (v) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
      if (x1 >= 0) { push(); grid = grid.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1)); }
    },
  };
  const run = op => { OPS[op](); refresh(); fit(); };
  document.querySelectorAll('[data-op]').forEach(b => { b.onclick = () => run(b.dataset.op); });
  $('fix').onclick = () => run('fix');
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target.closest('input,select,textarea')) return;
    e.preventDefault(); run(e.shiftKey ? 'redo' : 'undo');
  });
  document.querySelectorAll('[data-sym]').forEach(b => {
    b.onclick = () => {
      sym = b.dataset.sym;
      document.querySelectorAll('[data-sym]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      draw();
    };
  });
  $('ink').onchange = e => { ink = e.target.value; };
  $('mod').onchange = e => { mod = e.target.value; renderInspector(); };

  // ------------------------------------------------------------ export / import
  // Inside claude.ai the page gets a downloads capability; anywhere else, a plain <a download>.
  let downloads = null;
  (async () => { try { downloads = await window.claude?.use?.('downloads'); } catch (e) {} })();
  async function give(filename, data) {
    if (downloads) {
      try { await downloads.save({ filename, data }); msg('Salvato: ' + filename); }
      catch (e) { msg(e && e.code === 'declined' ? 'Download annullato.' : 'Download non riuscito.'); }
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg('Salvato: ' + filename);
  }
  const pngBlob = (g, col, s) => new Promise(r => { const c = document.createElement('canvas'); drawTo(c, g, s, col); c.toBlob(r, 'image/png'); });
  document.querySelectorAll('[data-ex]').forEach(b => {
    b.onclick = async () => {
      const t = b.dataset.ex, base = `${curSet}-${curName}`;
      if (t === 'png') give(base + '.png', await pngBlob(grid, ink, 32));
      if (t === 'svg') give(base + '.svg', new Blob([svgOf(grid, ink, MODULE[mod])], { type: 'image/svg+xml' }));
      if (t === 'json') give('reincantamento-icons.json', new Blob([JSON.stringify(DATA, null, 1)], { type: 'application/json' }));
      if (t === 'zip') {
        if (!window.JSZip) { msg('ZIP non disponibile: JSZip non è stato caricato.'); return; }
        const z = new JSZip();
        for (const k in DATA[curSet]) {
          const g = toGrid(DATA[curSet][k]);
          z.file(`svg/${k}.svg`, svgOf(g, BLUE, MODULE[mod]));
          z.file(`png-blue/${k}.png`, await pngBlob(g, BLUE, 32));
          z.file(`png-grey/${k}.png`, await pngBlob(g, GREY, 32));
        }
        give(curSet + '-icons.zip', await z.generateAsync({ type: 'blob' }));
      }
    };
  });
  $('import').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const p = JSON.parse(await f.text()); let n = 0;
      for (const st in p) for (const k in p[st]) {
        const rows = p[st][k];
        if (!Array.isArray(rows) || !rows.length || !rows.every(r => typeof r === 'string' && r.length === rows[0].length && /^[X.]+$/.test(r))) continue;
        (DATA[st] = DATA[st] || {})[k] = rows; n++;
      }
      grid = toGrid(DATA[curSet][curName]); save(); renderSets(); refresh(); fit(); msg(`Importate ${n} icone.`);
    } catch (err) { msg('Il file non è un JSON valido del Pixel Lab.'); }
    e.target.value = '';
  };

  load();
})();
