import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  plugins: [react(), cloudflare({ configPath: '../../wrangler.jsonc' })],
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.cjs'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
