// Drive the app's height from the viewport the device actually reports.
//
// CSS height alone is not reliable on iOS. `height: 100%` resolves against a
// height the browser decided on, which in an installed PWA can be short of the
// real screen - the app then stops above the bottom of the display and leaves a
// dead band under the nav. `100dvh` is closer but still lags a rotation or a
// change in browser chrome by a frame or two.
//
// Measuring window.innerHeight and publishing it as --app-h sidesteps all of
// that: whatever the device says its viewport is, that is what the shell uses.
//
// innerHeight rather than visualViewport.height on purpose. visualViewport
// shrinks when the software keyboard opens, which would resize the whole app
// out from under someone mid-type; innerHeight stays put.

let raf = 0;

function measure() {
  const h = window.innerHeight;
  if (h > 0) document.documentElement.style.setProperty('--app-h', h + 'px');
}

function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(measure);
}

export function trackViewportHeight() {
  if (typeof window === 'undefined') return;
  measure();
  window.addEventListener('resize', schedule);
  // iOS reports the pre-rotation height for a moment after orientationchange,
  // so take a second reading once the new layout has settled.
  window.addEventListener('orientationchange', () => {
    schedule();
    setTimeout(measure, 300);
  });
  // Coming back from the background can restore a stale value.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
}
