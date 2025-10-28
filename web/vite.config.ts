import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
