import React from 'react'
import { IconFlame, IconBand, IconDumbbell, IconLeaf } from '../components/icons'
import { BrandIcon, hasBrandIcon } from '../components/BrandIcon'
import { BRAND_ICONS } from '../data/brandIcons'

// ── Section-icon library ─────────────────────────────────────────
// The full uploaded brand icon set (public/icons). Coaches pick one in the
// programme builder (stored as `brand:<Name>`) or paste a custom SVG.
export const ICON_LIBRARY = BRAND_ICONS.map((name) => ({ key: name, label: name, value: `brand:${name}` }));

// Default brand glyph by section kind (used when no custom icon is set).
const KIND_BRAND = { PULSE_RAISER: 'Flame', BANDED: 'Stretches', MAIN: 'Weightlifting', COOLDOWN: 'Cooldown' };

// Fallback line icons if a brand icon is somehow missing.
function defaultLineIcon(kind, s) {
  return kind === 'PULSE_RAISER' ? <IconFlame size={s}/>
    : kind === 'BANDED'   ? <IconBand size={s}/>
    : kind === 'COOLDOWN' ? <IconLeaf size={s}/>
    : <IconDumbbell size={s}/>;
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
  const hasPaint = /(fill|stroke)=/i.test(inner);
  return { viewBox, inner, fill: hasPaint ? undefined : 'currentColor' };
}

// ── Renderer ─────────────────────────────────────────────────────
// `icon`: '' / null → default by kind; 'brand:<Name>' → uploaded brand icon;
// '<svg…>' → sanitised custom SVG. ('lib:' from the old set falls back to kind.)
export function SectionGlyph({ icon, kind, size = 15, color = 'currentColor', glow = false }) {
  if (typeof icon === 'string' && icon.startsWith('brand:')) {
    const name = icon.slice(6);
    if (hasBrandIcon(name)) return <BrandIcon name={name} size={size} color={color} glow={glow} />;
  }
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
    const safe = sanitizeSvg(icon);
    if (safe) return (
      <span style={{
        display: 'inline-grid', placeItems: 'center', color, width: size, height: size,
        filter: glow ? `drop-shadow(0 0 calc(5px * var(--glow)) color-mix(in srgb, ${color} 55%, transparent))` : 'none',
      }}>
        <svg width={size} height={size} viewBox={safe.viewBox} fill={safe.fill}
          style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: safe.inner }} />
      </span>
    );
  }
  // Default by section kind → brand icon (fallback to a line icon).
  const brand = KIND_BRAND[kind];
  if (brand && hasBrandIcon(brand)) return <BrandIcon name={brand} size={size} color={color} glow={glow} />;
  return (
    <span style={{
      display: 'inline-grid', placeItems: 'center', color, width: size, height: size,
      filter: glow ? `drop-shadow(0 0 calc(5px * var(--glow)) color-mix(in srgb, ${color} 55%, transparent))` : 'none',
    }}>{defaultLineIcon(kind, size)}</span>
  );
}
