/* REINCANTAMENTO — theme bootstrap.
   Loaded SYNCHRONOUSLY in <head> (no defer) so the stored choice is applied
   before first paint and the page never flashes the other palette. Kept apart
   from site.js for exactly that reason. */
(() => {
    'use strict';
    try {
        if (localStorage.getItem('reinc-theme') === 'acid') {
            document.documentElement.setAttribute('data-theme', 'acid');
        }
    } catch (err) {
        /* Private mode / blocked storage — the default palette is correct. */
    }
})();
