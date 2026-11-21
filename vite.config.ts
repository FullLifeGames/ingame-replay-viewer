import { resolve } from 'node:path'
import { defineConfig } from 'vite'

import { FS_DENY, romServer } from './scripts/web-server.ts'

// The page lives in src/web/; the build lands in dist/ at the repository root. The plugin makes
// every response cross-origin isolated and serves the two build outputs the page needs from
// build/rom/; FS_DENY keeps /@fs/ away from the build, the pinned tree and ROM files.
export default defineConfig({
  root: 'src/web',
  plugins: [romServer()],
  server: {
    fs: { deny: FS_DENY },
    // Tailscale's HTTPS names, for the user's link (plan S5b D1 (a)).
    allowedHosts: ['.ts.net'],
  },
  // mgba.js starts its pthread worker and loads its wasm from its own URL, so it is served as is.
  optimizeDeps: { exclude: ['@thenick775/mgba-wasm'] },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    // The WebAssembly spike page (#35) sits beside the emulator page.
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'src/web/index.html'),
        wasm: resolve(import.meta.dirname, 'src/web/wasm.html'),
      },
    },
  },
  // The spike's worker is a module worker: it imports the Emscripten glue at run time.
  worker: { format: 'es' },
})
