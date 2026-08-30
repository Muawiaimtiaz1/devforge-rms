import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/service-worker.js': 'http://localhost:4000',
      '/manifest.json': 'http://localhost:4000',
      '/icons': 'http://localhost:4000',
    },
  },
})
