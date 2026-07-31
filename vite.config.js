import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Client Decision Support Toolkit — Grott Luker & Co.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
  },
})
