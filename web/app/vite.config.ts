import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(appDir, '..')

// The cockpit server (src/server/server.ts) owns /api on port 4321 and serves the built app from web/dist.
const API_TARGET = 'http://127.0.0.1:4321'

export default defineConfig({
  root: appDir,
  base: '/',
  // Tailwind v4 is CSS-first: the whole theme lives in src/styles/index.css, there is no tailwind.config.js.
  plugins: [react(), tailwindcss()],
  build: {
    // Sibling of the legacy UI files (web/index.html, app.js, style.css), which stay untouched.
    outDir: resolve(webDir, 'dist'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
