// The layer probe, as a setting rather than a screen's local state.
//
// It was neither: a useState inside the diagnostics panel, cleaned up when that
// panel unmounted - which is the moment you navigate away from Settings. So the
// one tool for finding a strip that shows up "everywhere in the app" switched
// itself off the instant you went to look anywhere else.
//
// It lives in localStorage and is applied to <html> at boot, so it survives
// navigation, a reload, and the app being closed and reopened.
//
// The off switch is built with plain DOM and attached to <body>, deliberately
// outside React and outside the app's own frame: a debugging aid that outlives
// the screen it was switched on from is how someone ends up staring at a
// magenta app with no idea where the switch went - and it should still be
// there if the thing being debugged is what took the app down.

const KEY = 'hs_layer_probe';
const BADGE_ID = 'hs-layerprobe-badge';

export const EVENT = 'hs-layerprobe';

export function probeOn() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}

export function setProbe(on) {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  apply(on);
  // So the button in Settings and the badge agree, whichever one was used.
  try { window.dispatchEvent(new Event(EVENT)); } catch (e) { /* ignore */ }
}

export function apply(on = probeOn()) {
  const root = document.documentElement;
  if (on) root.setAttribute('data-layerprobe', '');
  else root.removeAttribute('data-layerprobe');
  badge(on);
  gapReport(on);
}

// Top-centre on purpose: it must never cover the bottom edge it exists to help
// photograph.
function badge(on) {
  const existing = document.getElementById(BADGE_ID);
  if (!on) { existing?.remove(); return; }
  if (existing || !document.body) return;
  const b = document.createElement('button');
  b.id = BADGE_ID;
  b.textContent = 'LAYER COLOURS ON · TAP TO TURN OFF';
  b.style.cssText = [
    'position:fixed', 'z-index:2147483647',
    'top:calc(env(safe-area-inset-top, 0px) + 6px)', 'left:50%', 'transform:translateX(-50%)',
    'padding:6px 12px', 'border-radius:999px', 'white-space:nowrap',
    'background:#000', 'color:#fff', 'border:1px solid #fff',
    'font:700 9px/1 ui-monospace, monospace', 'letter-spacing:0.1em', 'cursor:pointer',
  ].join(';');
  b.addEventListener('click', () => setProbe(false));
  document.body.appendChild(b);
}

// The measurement, printed inside the gap it is measuring.
//
// Three rounds have now ended with a screenshot of the band and no numbers
// beside it, because the numbers lived on a different screen and had to be
// gone and fetched. This puts them where the band is: absolutely positioned
// against body, which every measurement so far says is the one box that
// reaches the physical bottom of the screen - so if there is a gap, this sits
// in it and labels it, and if there isn't, it sits on the bottom edge and says
// so. Green means no gap; the build is on the line either way, which is what
// answers "is the fix even deployed yet?" without comparing hashes by eye.
function gapReport(on) {
  const id = 'hs-gap-report';
  const existing = document.getElementById(id);
  if (!on) { existing?.remove(); return; }
  if (!document.body) return;

  const el = existing || document.createElement('div');
  if (!existing) {
    el.id = id;
    el.style.cssText = [
      'position:absolute', 'bottom:0', 'left:0', 'right:0', 'z-index:2147483646',
      'padding:3px 6px', 'text-align:center', 'pointer-events:none',
      'font:700 8.5px/1.5 ui-monospace, monospace', 'letter-spacing:0.04em',
      'white-space:pre-wrap', 'word-break:break-all',
    ].join(';');
    document.body.appendChild(el);
  }

  const measure = () => {
    if (!document.getElementById(id)) return;
    const r = document.getElementById('root')?.getBoundingClientRect();
    const b = document.body.getBoundingClientRect();
    const ih = window.innerHeight;
    const gap = r ? Math.round(ih - r.bottom) : -1;
    const pos = (() => { const e = document.getElementById('root'); return e ? getComputedStyle(e).position : '?'; })();
    const build = (typeof window !== 'undefined' && window.__BUILD__) || '?';
    el.style.background = gap === 0 ? '#0a7d3a' : '#b00020';
    el.style.color = '#fff';
    el.textContent =
      `${gap === 0 ? 'NO GAP' : 'GAP ' + gap + 'px'} · root ${r ? Math.round(r.top) + '..' + Math.round(r.bottom) : '?'}`
      + ` · body ${Math.round(b.top)}..${Math.round(b.bottom)} · inner ${ih} · pos ${pos} · build ${build}`;
  };

  measure();
  if (!existing) {
    const again = () => setTimeout(measure, 60);
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', again);
    document.addEventListener('visibilitychange', again);
  }
}
