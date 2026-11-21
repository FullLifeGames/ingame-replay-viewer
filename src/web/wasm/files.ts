// The build outputs the WebAssembly spike page fetches, as paths relative to the page. The dev
// server plugin (scripts/web-server.ts) serves exactly these from build/wasm/; its spec ties each to
// the build's names in scripts/wasm-link.ts and scripts/wasm-outputs.ts. The module itself is
// never served: the page rebuilds it from the user's dump with the patch.
export const WASM_FILES = {
  glue: 'wasm/irv-emerald.js',
  patch: 'wasm/irv-emerald-wasm.bps',
}
