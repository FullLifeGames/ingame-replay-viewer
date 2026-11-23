// The build outputs the viewer fetches, as paths relative to the page, and the
// build that makes them. The dev server plugin (scripts/web-server.ts) serves exactly these from
// build/wasm/; its spec ties each to the build's names in scripts/wasm-link.ts and
// scripts/wasm-outputs.ts. The module itself is never served: the page rebuilds it from the
// user's dump with the patch.
export const WASM_FILES = {
  glue: 'wasm/irv-emerald.js',
  patch: 'wasm/irv-emerald-wasm.bps',
}

/**
 * The commands that make the module's glue, its patch and replay-slot.json, in order. src/web/
 * cannot import scripts/, so scripts/web-server.test.ts holds it equal to `WASM_BUILD_STEPS` in
 * scripts/wasm-link.ts.
 */
export const MODULE_BUILD_STEPS =
  'npm run rom:build, npm run wasm:build -- --compile, npm run wasm:convert and ' +
  'npm run wasm:build -- --link'
