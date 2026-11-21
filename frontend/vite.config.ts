import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const extensions = ['.tsx', '.ts', '.jsx', '.js', '.json']

function resolveExtensionsPlugin() {
  return {
    name: 'resolve-extensions-hash-workaround',
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.startsWith('.')) return null
      // Importer might have queries or be formatted with URL
      const cleanImporter = importer.split('?')[0]
      const dir = path.dirname(cleanImporter)
      const targetPath = path.resolve(dir, source)
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        return targetPath
      }
      for (const ext of extensions) {
        const full = targetPath + ext
        if (fs.existsSync(full)) {
          return full
        }
        const indexFile = path.join(targetPath, 'index' + ext)
        if (fs.existsSync(indexFile)) {
          return indexFile
        }
      }
      return null
    },
  }
}

export default defineConfig(async ({ command, mode }) => ({
  base: './',
  plugins: [
    ...(command === 'serve' && (process.env.VITE_MOCK || mode === 'mock')
      ? [(await import('./mock/mock-api')).mockApi()]
      : []),
    resolveExtensionsPlugin(),
    react(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
}))
