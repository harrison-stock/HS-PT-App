import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { apply as applyLayerProbe } from './lib/layerProbe'

// Which commit is this? Set before anything reads it - the probe's own gap
// report prints it, and printing "?" is how a deploy question goes unanswered.
window.__BUILD__ = __BUILD__;

// Before the app mounts, so a probe left switched on is on from the first
// paint - and its off switch is present even if the app never gets that far.
applyLayerProbe();

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Readable from the console too.
console.info('%cHS PT', 'color:#46BBC0;font-weight:700', 'build', __BUILD__);


// Register the service worker so the app can be installed to the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
  });
}

