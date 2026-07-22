import React from 'react'
import { BRAND_ICONS, brandIconUrl } from '../data/brandIcons'

const HAVE = new Set(BRAND_ICONS);
export const hasBrandIcon = (name) => HAVE.has(name);

// Renders a brand SVG (public/icons/*.svg) as a CSS mask so the monochrome
// artwork adopts `color` (currentColor by default) and can glow - same
// recolour/glow behaviour as the built-in line icons.
export function BrandIcon({ name, size = 20, color = 'currentColor', glow = false, style }) {
  if (!HAVE.has(name)) return null;
  const url = `url("${brandIconUrl(name)}")`;
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: size, height: size, flexShrink: 0,
      background: color,
      WebkitMaskImage: url, maskImage: url,
      WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center', maskPosition: 'center',
      WebkitMaskSize: 'contain', maskSize: 'contain',
      filter: glow ? `drop-shadow(0 0 calc(6px * var(--glow)) color-mix(in srgb, ${color} 55%, transparent))` : 'none',
      ...style,
    }} />
  );
}
