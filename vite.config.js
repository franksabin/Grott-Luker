import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devApi from './vite-dev-api.js'

// Client Decision Support Toolkit — Grott Luker & Co.
export default defineConfig({
  // devApi serves the submissions endpoints during `vite dev` only; in
  // production those routes are handled by the Cloudflare Worker (worker/index.js).
  plugins: [react(), devApi()],
  server: {
    port: 5174,
    strictPort: false,
    // scripts/check_print.py makes throwaway Chrome profiles here; watching their locked files
    // (EBUSY on Windows) crashes the dev server.
    watch: { ignored: ['**/scripts/print-out/**'] },
  },
})
