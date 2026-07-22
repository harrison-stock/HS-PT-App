import React from 'react'
import { IconChevronLeft, IconX2 } from './icons'

// Brand hexagon - exact shape from HS Hexagon (Viridian Green).svg
// Source viewBox: 0 0 389 365. Path centered, with rounded inner radii.
export const HEX_PATH = "M194.489,30.721c-3.782,0 -7.574,0.799 -10.995,2.417l-141.142,66.762c-6.877,3.253 -11.356,9.426 -11.356,16.346l0,133.524c0,6.921 4.479,13.093 11.356,16.346l141.142,66.762c6.776,3.205 15.227,3.205 22.002,0l141.136,-66.762c6.876,-3.253 11.362,-9.424 11.362,-16.346l0,-133.524c0,-6.922 -4.486,-13.093 -11.362,-16.346l-141.136,-66.762c-3.418,-1.617 -7.23,-2.417 -11.007,-2.417Z";
export const HEX_VB = '0 0 389 365';
export const HEX_RATIO = 389 / 365;

// <HexShape> - solid filled hex (SVG-based), inherits currentColor.
// Props: size (px, height), fill (color override), stroke, strokeWidth, style
export const HexShape = ({ size = 24, fill = 'currentColor', stroke, strokeWidth = 0, style, ...rest }) => (
  <svg width={size * HEX_RATIO} height={size} viewBox={HEX_VB}
       xmlns="http://www.w3.org/2000/svg"
       style={{ display: 'block', ...style }} {...rest}>
    <path d={HEX_PATH} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round"/>
  </svg>
);

// <Hex> - clips children into the brand hex shape via CSS clip-path.
export const Hex = ({ size, children, style, className = '', square = false, ...rest }) => {
  const w = size ?? 'auto';
  const h = size ? (square ? size : size / HEX_RATIO) : 'auto';
  return (
    <div
      className={'hex ' + className}
      style={{
        width: w, height: h,
        display: 'grid', placeItems: 'center',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

// <HexProgress> - animated hex stroke used like a circular progress ring.
// pct: 0..1. accent: stroke color. trackColor optional.
export const HexProgress = ({ size = 64, pct = 0, accent = 'var(--accent)', trackColor = 'rgba(255,255,255,0.07)', strokeWidth = 16, glow = true, children, style }) => {
  const pathRef = React.useRef(null);
  const [len, setLen] = React.useState(1140);
  React.useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, []);
  return (
    <div style={{ position: 'relative', width: size * HEX_RATIO, height: size, ...style }}>
      <svg width="100%" height="100%" viewBox={HEX_VB} style={{ display: 'block', overflow: 'visible' }}>
        <path d={HEX_PATH} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinejoin="round"/>
        <path ref={pathRef} d={HEX_PATH} fill="none" stroke={accent}
              strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={`${len * pct} ${len}`}
              style={{
                filter: glow ? 'drop-shadow(0 0 calc(6px * var(--glow)) var(--accent-glow))' : 'none',
                transition: 'stroke-dasharray .5s ease',
              }}/>
      </svg>
      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          {children}
        </div>
      )}
    </div>
  );
};

// <HexBackButton> - brand-hex back control used app-wide.
// variant: 'surface' (on page bg) | 'overlay' (on hero image)
// label: optional text shown to the right of the hex (e.g. "CATEGORIES")
export const HexBackButton = ({ onClick, variant = 'surface', label, size = 38, icon = 'chevron', style }) => {
  const overlay = variant === 'overlay';
  const Glyph = icon === 'close' ? IconX2 : IconChevronLeft;
  return (
    <button onClick={onClick} aria-label={label || 'Back'} style={{
      all: 'unset', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 10,
      ...style,
    }}>
      <Hex size={size} square style={{
        background: overlay ? 'rgba(10,15,20,0.82)' : 'var(--bg-2)',
        border: overlay ? '1.5px solid rgba(255,255,255,0.45)' : '1px solid var(--line-strong)',
        backdropFilter: overlay ? 'blur(8px)' : 'none',
        color: overlay ? '#fff' : 'var(--text)',
        boxShadow: overlay ? '0 2px 10px rgba(0,0,0,0.5)' : 'none',
      }}>
        <IconChevronLeft size={Math.round(size * 0.42)} />
      </Hex>
      {label && (
        <span className="mono" style={{
          fontSize: 11, letterSpacing: '0.12em', fontWeight: 600,
          color: overlay ? '#fff' : 'var(--text-2)', textTransform: 'uppercase',
        }}>{label}</span>
      )}
    </button>
  );
};
