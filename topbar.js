// =============================================================
// Global bottom navigation bar.
// Drop this on any page with:
//     <script src="topbar.js" defer></script>
// Self-injects a fixed 6-tab bottom nav: Main · Water · Stack · Sleep · Gym · Finance
// =============================================================
(function () {
  'use strict';

  // -------- CSS --------
  const css = `
/* === Global bottom nav === */
:root { --gbn-h: 58px; }

.bottomnav {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
  display: flex;
  background: rgba(10, 10, 11, 0.94);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: env(safe-area-inset-bottom);
  height: calc(var(--gbn-h) + env(safe-area-inset-bottom));
}
.bn-tab {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 0 4px;
  text-decoration: none;
  color: rgba(255, 255, 255, 0.35);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.09em; text-transform: uppercase;
  border-top: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  white-space: nowrap;
}
.bn-tab:hover { color: rgba(255, 255, 255, 0.6); }
.bn-tab.active { color: #FAFAFA; border-top-color: #6EE7B7; }

/* Body padding so page content isn't hidden behind the nav */
body {
  padding-bottom: calc(var(--gbn-h) + env(safe-area-inset-bottom)) !important;
}

/* Modal body lock */
body.topbar-modal-open { overflow: hidden; touch-action: none; }

/* Push finance.html's internal tab bar above the global nav */
.bottom-tabs {
  bottom: calc(var(--gbn-h) + env(safe-area-inset-bottom));
}
/* Give the finance content shell room for both nav bars */
.shell {
  padding-bottom: calc(var(--gbn-h) + 90px + env(safe-area-inset-bottom)) !important;
}

/* === Global mobile polish === */
html, body { -webkit-text-size-adjust: 100%; }
@media (max-width: 768px) {
  html { touch-action: pan-y; }
  ::-webkit-scrollbar { width: 0; height: 0; display: none; }
  html, body { scrollbar-width: none; -ms-overflow-style: none; }
}
.modal-bg, .modal, .po-modal-bg, .po-modal, .wt-overlay, .wt-viewer {
  overscroll-behavior: contain;
}
@media (max-width: 480px) {
  .modal-bg, .po-modal-bg {
    padding: 0 !important;
    align-items: stretch !important;
    justify-content: stretch !important;
  }
  .modal, .po-modal {
    width: 100% !important;
    max-width: 100% !important;
    max-height: 100vh !important;
    height: 100vh !important;
    border-radius: 0 !important;
    padding-top: max(20px, env(safe-area-inset-top)) !important;
    padding-bottom: max(28px, env(safe-area-inset-bottom)) !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
  }
}
`;

  // -------- HTML --------
  const html = `
<nav class="bottomnav" id="bottomnav" role="navigation" aria-label="Main navigation">
  <a href="index.html"   class="bn-tab" data-page="main"    >Main</a>
  <a href="water.html"   class="bn-tab" data-page="water"   >Water</a>
  <a href="health.html"  class="bn-tab" data-page="health"  >Stack</a>
  <a href="sleep.html"   class="bn-tab" data-page="sleep"   >Sleep</a>
  <a href="gym.html"     class="bn-tab" data-page="gym"     >Gym</a>
  <a href="finance.html" class="bn-tab" data-page="finance" >Finance</a>
</nav>
`;

  function injectStyleAndHTML() {
    if (document.getElementById('bottomnav')) return;
    const style = document.createElement('style');
    style.id = 'topbar-style';
    style.textContent = css;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    document.body.appendChild(wrap.firstChild);
  }

  // -------- Active page highlight --------
  function markActive() {
    const path = window.location.pathname.toLowerCase();
    document.querySelectorAll('.bn-tab[data-page]').forEach(t => {
      const pg = t.dataset.page;
      let active = false;
      if (pg === 'main') {
        active = path.endsWith('index.html') || path === '/' || path.endsWith('/');
      } else {
        active = path.endsWith(pg + '.html');
      }
      t.classList.toggle('active', active);
    });
  }

  // -------- Mobile lockdown --------
  function blockGesture(e) { e.preventDefault(); }
  function lockGestures() {
    document.addEventListener('gesturestart',  blockGesture, { passive: false });
    document.addEventListener('gesturechange', blockGesture, { passive: false });
    document.addEventListener('gestureend',    blockGesture, { passive: false });
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  // Watch modal classes and lock body scroll when any modal is open.
  function startModalLock() {
    const SELECTORS = ['.modal-bg', '.po-modal-bg', '.wt-overlay', '.wt-viewer', '.wt-cam'];
    function anyOpen() {
      for (const sel of SELECTORS) {
        for (const el of document.querySelectorAll(sel)) {
          if (el.classList.contains('show') || el.classList.contains('is-open')) return true;
        }
      }
      return false;
    }
    function sync() { document.body.classList.toggle('topbar-modal-open', anyOpen()); }
    new MutationObserver(sync).observe(document.body, {
      attributes: true, attributeFilter: ['class'], subtree: true
    });
    sync();
  }

  // -------- Boot --------
  function boot() {
    injectStyleAndHTML();
    markActive();
    lockGestures();
    startModalLock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
