import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev, forward API calls to FastAPI. In production, Caddy does this job.
    // xfwd adds X-Forwarded-Host (like Caddy does), so the server's same-site
    // check sees the page's real host rather than localhost:8000.
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, xfwd: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
