import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

const server = 'http://127.0.0.1:4950'

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwind()],
  build: { outDir: '../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 5000 },
  server: {
    port: 4951,
    strictPort: true,
    proxy: {
      '/api': { target: server, changeOrigin: true },
      '/ws': { target: server, changeOrigin: true, ws: true },
    },
  },
})
