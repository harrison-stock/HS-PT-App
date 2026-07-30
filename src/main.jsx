import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Which commit is this? Readable from the console as __BUILD__, and shown at
// the foot of the profile screen, so a "did my fix deploy?" question has an
// answer that doesn't depend on guessing.
window.__BUILD__ = __BUILD__;
console.info('%cHS PT', 'color:#46BBC0;font-weight:700', 'build', __BUILD__);

// Register the service worker so the app can be installed to the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
  });
}

