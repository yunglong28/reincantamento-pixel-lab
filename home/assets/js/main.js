/* REINCANTAMENTO — site behaviour
   Progressive enhancement: nothing here is required for the page to render or
   for the links to work. JS only layers on convenience (a collapsible nav on
   small screens) on top of a fully functional HTML/CSS baseline. */
(() => {
    'use strict';

    // Mark that JS is available so CSS can enhance accordingly (e.g. hide the
    // mobile toggle when JS is off, keeping the nav always visible).
    const root = document.documentElement;
    root.classList.add('js');

    /* ---- Grid-fit ----
       Size the grid module per axis so whole columns fill the viewport WIDTH and
       whole rows fill its HEIGHT — no partial column on the right edge, no gutter
       under the bottom media row. We pick the count closest to the 90px target on
       each axis and divide: colW = w / round(w/90), rowH = h / round(h/90). Cells
       end up very slightly non-square (a few px) but every background line lands
       on a real boundary. Without JS the 90px fallback (small remainders) applies. */
    const TARGET_CELL = 90;
    const MOBILE_BP = 768;          // below this the CSS mobile layout owns the hero
    const statement = document.querySelector('.statement');
    let fitQueued = false;

    /* Snap the central statement panel to whole grid cells so its edges land on
       the background grid lines (instead of cutting through squares). We measure
       the panel's natural size — its lines break only on the hard <br>s, so width
       is just the longest line + padding — then round both dimensions UP to whole
       cells and centre it, snapping the offset to whole cells too. The text stays
       left-aligned ("a bandiera") and vertically centred inside the slightly
       larger box. On mobile we hand the hero back to the CSS layout. */
    const clearSnap = () => {
        if (!statement) return;
        statement.style.position = '';
        statement.style.width = '';
        statement.style.height = '';
        statement.style.maxWidth = '';
        statement.style.left = '';
        statement.style.top = '';
    };

    const placeStatement = (colW, rowH) => {
        if (!statement) return;
        if (window.innerWidth <= MOBILE_BP) { clearSnap(); return; }

        // Measure the natural content box (unconstrained width → wraps only at <br>).
        statement.style.position = 'absolute';
        statement.style.maxWidth = 'none';
        statement.style.width = 'max-content';
        statement.style.height = 'auto';
        statement.style.left = '0px';
        statement.style.top = '0px';
        const natW = statement.offsetWidth;
        const natH = statement.offsetHeight;

        // colW/rowH divide the viewport exactly, so these counts are exact.
        const colsAvail = Math.round(root.clientWidth / colW);
        const rowsAvail = Math.round(window.innerHeight / rowH);
        // Hug the text to a whole number of columns and centre it: equal side
        // margins (no left/right asymmetry) and the mask never stretches past the
        // text. At the ~1440 design width the home statement lands on 12 columns →
        // exactly two empty columns per side; shorter copy (e.g. the About page)
        // simply centres with wider, still-symmetric margins.
        const wCells = Math.min(colsAvail, Math.ceil(natW / colW));
        const hCells = Math.min(rowsAvail - 1, Math.ceil(natH / rowH)); // keep header row clear
        const leftCells = Math.max(0, Math.round((colsAvail - wCells) / 2));
        const topCells = Math.max(1, Math.round((rowsAvail - hCells) / 2));

        // The background grid paints each line as a 1px band on the LEADING
        // (top/left) edge of every cell. A fill landing exactly on a cell
        // boundary therefore covers the top & left lines, while the bottom &
        // right lines (the next cell's leading edge) stay visible — an
        // asymmetry. Inset the fill by that 1px on top/left so all four bounding
        // lines read the same; right & bottom stay put (size shrinks by 1px).
        const LINE = 1;
        statement.style.left = (leftCells * colW + LINE) + 'px';
        statement.style.top = (topCells * rowH + LINE) + 'px';
        statement.style.width = (wCells * colW - LINE) + 'px';
        statement.style.height = (hCells * rowH - LINE) + 'px';
    };


    /* Snap the WRITINGS cell to the grid. The nav is a row of text with gaps,
       so the item lands wherever the labels put it; its blue square and the
       menu under it are cell-sized, and a square that misses the painted lines
       reads as a mistake on a page made of them. Shifting a relatively
       positioned item leaves the row's spacing untouched. */
    const navItem = document.querySelector('.nav-item');

    const snapNavItem = (colW) => {
        if (!navItem) return;
        navItem.style.left = '';
        if (window.innerWidth <= MOBILE_BP) return;
        const x = navItem.getBoundingClientRect().left;
        navItem.style.left = (Math.round(x / colW) * colW - x) + 'px';
    };

    const fitGrid = () => {
        fitQueued = false;
        // clientWidth, not innerWidth: the page scrolls now that it carries a
        // footer, and a classic (non-overlay) scrollbar would otherwise leave a
        // partial column against the right edge.
        const w = root.clientWidth, h = window.innerHeight;
        const cols = Math.max(1, Math.round(w / TARGET_CELL));
        const rows = Math.max(1, Math.round(h / TARGET_CELL));
        const colW = w / cols;   // columns divide the width  with no partial column
        const rowH = h / rows;   // rows    divide the height with no partial row
        root.style.setProperty('--grid-col', colW + 'px');
        root.style.setProperty('--grid-row', rowH + 'px');
        // Where the colourway switch sits: the last row of the screen. The rows
        // divide the height exactly here, so this is simply the one before last.
        root.style.setProperty('--screen-last-row', ((rows - 1) * rowH) + 'px');
        root.style.setProperty('--screen-h', (rows * rowH) + 'px');
        snapNavItem(colW);
        placeStatement(colW, rowH);
    };

    // A phone fires resize as its toolbar slides in and out while scrolling;
    // refitting then would shift the first screen — media cell and switch —
    // under the reader. On touch screens only a width change refits.
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let lastW = root.clientWidth;

    const scheduleFit = (e) => {
        if (e && e.type === 'resize' && coarse && root.clientWidth === lastW) return;
        lastW = root.clientWidth;
        if (fitQueued) return;
        fitQueued = true;
        requestAnimationFrame(fitGrid);
    };

    fitGrid();
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', scheduleFit);
    // Web fonts change the measured text width — re-snap once they're ready.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleFit);
    }

    /* ---- Acid mode ----
       theme.js has already applied the stored choice before first paint; here we
       only wire the switch and persist what the reader picks. It sits in the
       footer here as it does on the section pages (site.js runs the same logic);
       About and Lab, which have no footer, carry it in the header row. */
    const themeSwitch = document.querySelector('.theme-switch, .theme-toggle');

    if (themeSwitch) {
        const syncSwitch = () => {
            themeSwitch.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'acid'));
        };

        syncSwitch();

        themeSwitch.addEventListener('click', () => {
            const on = root.getAttribute('data-theme') === 'acid';
            if (on) {
                root.removeAttribute('data-theme');
            } else {
                root.setAttribute('data-theme', 'acid');
            }
            try {
                localStorage.setItem('reinc-theme', on ? 'default' : 'acid');
            } catch (err) {
                /* Storage unavailable — the switch still works for this visit. */
            }
            syncSwitch();
        });
    }

    /* ---- Mobile navigation toggle ---- */
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('#primary-nav');
    if (!toggle || !nav) return; // markup not present — nothing to enhance

    const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        nav.dataset.open = String(open);
    };

    setOpen(false);

    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        setOpen(!open);
    });

    // Close when a link is chosen.
    nav.addEventListener('click', (e) => {
        if (e.target.closest('a')) setOpen(false);
    });

    // Close on Escape, returning focus to the toggle.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            toggle.focus();
        }
    });

    // Close when clicking outside the header.
    document.addEventListener('click', (e) => {
        if (toggle.getAttribute('aria-expanded') !== 'true') return;
        if (!e.target.closest('.site-header')) setOpen(false);
    });
})();
