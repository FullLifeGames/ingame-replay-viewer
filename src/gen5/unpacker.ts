// The Gen 5 page's unpacker of the emulator's core (#79), by name: the worker script's file and
// path, which the page, the build, the manifest and both servers read, and the window.EJS_paths
// that sends EmulatorJS to it. It imports nothing, so the page loads no decoder for it; the
// worker's logic is src/gen5/core-unpack.ts.

/** EmulatorJS's name for its 7z unpacker, by which window.EJS_paths maps it, and the name of the
 * page's own worker script that stands in for it. */
export const UNPACKER_SCRIPT = 'extract7z.js'

/** Where both servers answer the worker script: the page's root. */
export const UNPACKER_PATH = `/${UNPACKER_SCRIPT}`

/** The worker's source in the page's folder, which scripts/gen5-built.ts bundles. */
export const UNPACKER_ENTRY = 'extract7z.ts'

/** What the page sets as window.EJS_paths: EmulatorJS's 7z unpacker resolves to the page's own
 * worker, every other file of EmulatorJS stays where its data path puts it. */
export function emulatorPaths(): Record<string, string> {
  return { [UNPACKER_SCRIPT]: UNPACKER_PATH }
}
