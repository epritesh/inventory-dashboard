import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Base path for assets:
  // - Default: '/'
  // - Override for Catalyst CLI client hosting (served at /app/): set env VITE_BASE_PATH="/app/"
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/server/api')
      }
    }
  },
  // Output production build to ../client so `catalyst deploy --only client` picks it up
  build: {
    outDir: '../client',
    emptyOutDir: true
  }
}))
