import React from 'react'
import {
  IconFlame, IconBand, IconDumbbell, IconLeaf, IconActivity, IconHeart,
  IconBolt, IconTimer, IconTrophy, IconClipboard, IconTarget, IconTrend,
  IconScale, IconMetronome, IconClock, IconSwap,
} from '../components/icons'

// ── Curated section-icon library ─────────────────────────────────
// Coaches pick one of these (stored as `lib:<key>`) or paste a custom SVG.
export const ICON_LIBRARY = [
  { key: 'flame',     label: 'Flame',      render: (s) => <IconFlame size={s}/> },
  { key: 'band',      label: 'Band',       render: (s) => <IconBand size={s}/> },
  { key: 'dumbbell',  label: 'Dumbbell',   render: (s) => <IconDumbbell size={s}/> },
  { key: 'leaf',      label: 'Leaf',       render: (s) => <IconLeaf size={s}/> },
  { key: 'activity',  label: 'Pulse',      render: (s) => <IconActivity size={s}/> },
  { key: 'heart',     label: 'Heart',      render: (s) => <IconHeart size={s}/> },
  { key: 'bolt',      label: 'Bolt',       render: (s) => <IconBolt size={s}/> },
  { key: 'timer',     label: 'Timer',      render: (s) => <IconTimer size={s}/> },
  { key: 'clock',     label: 'Clock',      render: (s) => <IconClock size={s}/> },
  { key: 'trophy',    label: 'Trophy',     render: (s) => <IconTrophy size={s}/> },
  { key: 'target',    label: 'Target',     render: (s) => <IconTarget size={s}/> },
  { key: 'trend',     label: 'Trend',      render: (s) => <IconTrend size={s}/> },
  { key: 'scale',     label: 'Scale',      render: (s) => <IconScale size={s}/> },
  { key: 'metronome', label: 'Tempo',      render: (s) => <IconMetronome size={s}/> },
  { key: 'clipboard', label: 'Clipboard',  render: (s) => <IconClipboard size={s}/> },
  { key: 'swap',      label: 'Swap',       render: (s) => <IconSwap size={s}/> },
];
const LIB = Object.fromEntries(ICON_LIBRARY.map(i => [i.key, i]));

// Default glyph by section kind (used when no custom icon is set).
export function defaultSectionRender(kind) {
  return kind === 'PULSE_RAISER' ? (s) => <IconFlame size={s}/>
    : kind === 'BANDED'   ? (s) => <IconBand size={s}/>
    : kind === 'COOLDOWN' ? (s) => <IconLeaf size={s}/>
    : (s) => <IconDumbbell size={s}/>;
}

// ── SVG sanitiser ────────────────────────────────────────────────
// Coach-authored SVG is shown to clients, so strip anything executable and
// keep only geometry. Non-`none` fills/strokes are rewritten to currentColor
// so the icon adopts its zone colour (and can glow) like the built-ins.
const ALLOWED_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'title']);
const ALLOWED_ATTR = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
  'points', 'transform', 'viewbox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'fill-rule', 'clip-rule', 'stroke-dasharray',
]);

export function sanitizeSvg(raw) {
  if (!raw || typeof raw !== 'string' || !/<svg[\s>]/i.test(raw)) return null;
  if (typeof window === 'undefined' || !window.DOMParser) return null;
  let doc;
  try { doc = new DOMParser().parseFromString(raw, 'image/svg+xml'); } catch (e) { return null; }
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;

  const clean = (el) => {
    [...el.children].forEach((child) => {
      if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) { child.remove(); return; }
      [...child.attributes].forEach((a) => {
        const n = a.name.toLowerCase();
        if (!ALLOWED_ATTR.has(n)) { child.removeAttribute(a.name); return; }
        if ((n === 'fill' || n === 'stroke') && a.value.trim().toLowerCase() !== 'none') {
          child.setAttribute(a.name, 'currentColor');
        }
      });
      clean(child);
    });
  };
  clean(svg);

  const viewBox = svg.getAttribute('viewBox') || '0 0 24 24';
  const inner = svg.innerHTML.trim();
  if (!inner) return null;
  // Default to a filled icon adopting currentColor when the markup sets no paint.
  const hasPaint = /(fill|stroke)=/i.test(inner);
  return { viewBox, inner, fill: hasPaint ? undefined : 'currentColor' };
}

// ── Renderer ─────────────────────────────────────────────────────
// `icon`: '' / null → default by kind; 'lib:<key>' → curated; '<svg…>' → custom.
export function SectionGlyph({ icon, kind, size = 15, color = 'currentColor', glow = false }) {
  const wrap = (node) => (
    <span style={{
      display: 'inline-grid', placeItems: 'center', color, width: size, height: size,
      filter: glow ? `drop-shadow(0 0 calc(5px * var(--glow)) color-mix(in srgb, ${color} 55%, transparent))` : 'none',
    }}>{node}</span>
  );

  if (typeof icon === 'string' && icon.startsWith('lib:')) {
    const item = LIB[icon.slice(4)];
    if (item) return wrap(item.render(size));
  }
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
    const safe = sanitizeSvg(icon);
    if (safe) return wrap(
      <svg width={size} height={size} viewBox={safe.viewBox} fill={safe.fill}
        style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: safe.inner }} />
    );
  }
  return wrap(defaultSectionRender(kind)(size));
}
