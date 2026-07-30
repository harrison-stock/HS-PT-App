import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamp the build so it's possible to tell, from the running app, which commit
// is actually being served. Chasing a layout bug through three deploys without
// being able to confirm the fix had landed is the reason this exists.
// Vercel/Netlify expose the commit SHA at build time; falls back to a timestamp.
const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA || '';
const stamp = (sha ? sha.slice(0, 7) : 'local') + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(stamp) },
});
