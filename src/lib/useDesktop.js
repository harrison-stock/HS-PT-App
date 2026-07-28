import React from 'react'

// "Am I on a laptop?" - a precise pointer (mouse/trackpad) on a wide screen.
// Phones and tablets report a coarse pointer, so they're excluded. Used to
// gate mouse-only affordances like drag-to-reorder, which would otherwise
// fight with touch scrolling on a phone.
const QUERY = '(pointer: fine) and (min-width: 980px)';

export function useDesktop() {
  const [is, setIs] = React.useState(() => {
    try { return window.matchMedia(QUERY).matches; } catch (e) { return false; }
  });
  React.useEffect(() => {
    let mq;
    try { mq = window.matchMedia(QUERY); } catch (e) { return; }
    const fn = (ev) => setIs(ev.matches);
    setIs(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); };
  }, []);
  return is;
}
