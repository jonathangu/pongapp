import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/pongapp/',
  publicDir: false,
  plugins: [react(), { name: 'puzzle-public-assets', async closeBundle() {
    // Older game sources remain available in Git; none of their engines or art ships here.
    for (const file of ['sw.js', 'manifest.webmanifest', 'favicon.svg', 'og.jpg', 'starling-apple-touch-icon.png', 'starling-icon-192.png', 'starling-icon-512.png', 'starling-icon-maskable-512.png']) await copyFile(resolve('public', file), resolve('dist', file))
  } }],
  define: { 'import.meta.env.VITE_RELEASE_ID': JSON.stringify(process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()) },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
