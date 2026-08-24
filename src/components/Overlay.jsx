import React from 'react'
import { createPortal } from 'react-dom'

// A full-screen overlay, positioned against the screen rather than against
// whatever happens to be above it in the tree.
//
// The sheets in the builder were `position: absolute; inset: 0` rendered from
// inside the day's scrolling content, so they sized themselves to that content
// - which is taller than the screen and scrolled. With `justify-content:
// flex-end` the sheet then sat at the bottom of the *content*, most of it below
// the visible area: on a phone that reads as the sheet opening blank, with a
// search field you cannot see receiving what you type. Which is what it did.
//
// `position: fixed` is not the answer either. An installed iPhone hands fixed
// positioning a viewport that stops short of the home-indicator strip - the
// same thing that put a band along the bottom of the app for eight rounds.
//
// So: portal to body, and size against body. body is height:100%,
// position:relative and cannot scroll, and every measurement taken on the
// device says it is the box that matches the screen.
export function Overlay({ zIndex = 200, onClick, className, style, children }) {
  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(
    <div onClick={onClick} className={className} style={{
      position: 'absolute', inset: 0, zIndex,
      display: 'flex', flexDirection: 'column',
      ...style,
    }}>{children}</div>,
    document.body,
  );
}
