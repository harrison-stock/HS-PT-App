import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

// Which commit is this? Set before anything reads it - the probe's own gap
// report prints it, and printing "?" is how a deploy question goes unanswered.
window.__BUILD__ = __BUILD__;

// The layer probe is gone; clear the flag so a device still holding it on
// isn't left waiting for a switch that no longer exists.
try { localStorage.removeItem('hs_layer_probe'); } catch (e) { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Readable from the console too.
console.info('%cHS PT', 'color:#46BBC0;font-weight:700', 'build', __BUILD__);


// Register the service worker so the app can be installed to the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
  });
}

