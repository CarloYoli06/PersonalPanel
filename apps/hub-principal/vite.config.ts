import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = resolve(__dirname, '../..')

const workspaceAliases = {
  '@panel/core-sdk': resolve(rootDir, 'packages/core-sdk/src'),
  '@panel/ui-kit': resolve(rootDir, 'packages/ui-kit/src'),
  '@panel/mod-video': resolve(rootDir, 'modules/mod-video/src'),
  '@panel/mod-scanner': resolve(rootDir, 'modules/mod-scanner/src'),
  '@panel/mod-optimizer': resolve(rootDir, 'modules/mod-optimizer/src'),
  '@panel/mod-pdf': resolve(rootDir, 'modules/mod-pdf/src')
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'src/renderer/public'),
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/src-rust/**']
    }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  resolve: {
    alias: {
      ...workspaceAliases,
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    target: 'esnext',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  },
  plugins: [react()]
})

