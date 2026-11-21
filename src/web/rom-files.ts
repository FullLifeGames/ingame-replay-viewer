// The build outputs the page fetches, as paths relative to the page, so a base path still works.
// The dev server plugin (scripts/web-server.ts) serves exactly these; its spec ties each to
// OUTPUT_NAMES in scripts/rom-outputs.ts.
export const ROM_FILES = {
  patch: 'rom/irv-emerald.bps',
  slot: 'rom/replay-slot.json',
}
