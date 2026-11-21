import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The page lives in src/web/; the build lands in dist/ at the repository root.
export default defineConfig({
  root: 'src/web',
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
})
