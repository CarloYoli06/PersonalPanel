import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const rootDir = resolve(__dirname, '../..')

const workspaceAliases = {
  '@panel/core-sdk': resolve(rootDir, 'packages/core-sdk/src'),
  '@panel/ui-kit': resolve(rootDir, 'packages/ui-kit/src'),
  '@panel/mod-video': resolve(rootDir, 'modules/mod-video/src'),
  '@panel/mod-scanner': resolve(rootDir, 'modules/mod-scanner/src'),
  '@panel/mod-optimizer': resolve(rootDir, 'modules/mod-optimizer/src')
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@panel/core-sdk', '@panel/ui-kit', '@panel/mod-video', '@panel/mod-scanner', '@panel/mod-optimizer']
      })
    ],
    resolve: {
      alias: workspaceAliases
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@panel/core-sdk', '@panel/ui-kit', '@panel/mod-video', '@panel/mod-scanner', '@panel/mod-optimizer']
      })
    ],
    resolve: {
      alias: workspaceAliases
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        ...workspaceAliases,
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      outDir: 'out/renderer'
    },
    plugins: [react()]
  }
})

