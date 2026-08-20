import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve('src') },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:7983', changeOrigin: true },
      '/ws': { target: 'ws://localhost:7983', ws: true },
    },
  },
  build: {
    outDir: 'dist/public',
  },
})
