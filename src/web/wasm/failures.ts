// The lines for a module the page could not build or the worker could not instantiate (#49). The
// module asks for a fixed linear memory at instantiation, with no growth, and a phone low on
// memory refuses it. Chromium and Safari throw a RangeError then ("Out of memory: Cannot allocate
// Wasm memory for new instance"), Firefox "could not allocate memory". That refusal gets its own
// line with the number; any other failure keeps the line that names the instantiation. The build
// before it (the patch applied to the dump, then the compile) can run out of memory too, which
// gets a line of its own.
import { messageOf } from '../message'

/**
 * The module's fixed memory in bytes. src/web/ cannot import scripts/, so scripts/web-server.test.ts
 * holds it equal to `linkSettings().initialMemory` in scripts/wasm-link.ts.
 */
export const MODULE_MEMORY_BYTES = 256 * 1024 * 1024

const MEBIBYTE = 1024 * 1024

// The browsers' words for an allocation that failed; a link error that names the memory's import
// is a build mismatch and does not match.
const REFUSED_MEMORY = /out of memory|allocate\b.*\bmemory/i

const refusedMemory = (error: unknown): boolean =>
  error instanceof RangeError || REFUSED_MEMORY.test(messageOf(error))

/** The line the page shows when `WebAssembly.instantiate` rejected with `error`. */
export function instantiateFailureLine(error: unknown): string {
  const words = messageOf(error)
  if (!refusedMemory(error)) return `The module did not instantiate: ${words}`
  return (
    `This browser did not give the game the ${String(MODULE_MEMORY_BYTES / MEBIBYTE)} MB of ` +
    `memory it needs (${words}). Close other tabs or apps, then press Start again.`
  )
}

/**
 * What the page shows when applying the patch to the dump or compiling the module threw `error`:
 * a refused memory as its own line, any other failure as it came. A browser does not fire a
 * file field's change for the same file, so the remedy loads the page again.
 */
export function buildFailure(error: unknown): unknown {
  if (!refusedMemory(error)) return error
  return new Error(
    'This browser ran out of memory while it built the game from your dump ' +
      `(${messageOf(error)}). Close other tabs or apps, then load the page again and pick your ` +
      'dump.',
  )
}
