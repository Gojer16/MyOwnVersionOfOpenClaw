import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:19789',
      '/ws': {
        target: 'ws://localhost:19789',
        ws: true
      }
    }
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true
  }
})
