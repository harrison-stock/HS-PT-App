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
