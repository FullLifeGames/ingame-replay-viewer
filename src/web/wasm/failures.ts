// The lines for a module the page could not build or the worker could not instantiate (#49). The
// module asks for a fixed linear memory at instantiation, with no growth, and a phone low on
// memory refuses it. Chromium and Safari throw a RangeError then ("Out of memory: Cannot allocate
// Wasm memory for new instance"), Firefox "could not allocate memory". That refusal gets its own
// line with the number; any other failure keeps the line that names the instantiation. The build
// before it (the patch applied to the dump, then the compile) can run out of memory too, which
// gets a line of its own. The worker's failed reports name their kind, so the page
// can give a visitor a line for each (visitor.ts).
import { SlotMismatchError } from '../../patch/slot'
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
 * Why a run failed: the game stopped, the slot comes from another build, the write refused the
 * stream, the browser refused the memory, the module did not instantiate, or AgbMain returned.
 */
export type RunFailureKind =
  'stopped' | 'mismatch' | 'write' | 'memory' | 'instantiate' | 'returned'

/** The worker's report of a failed run: its kind, and the module's line. */
export interface FailedReport {
  readonly type: 'failed'
  readonly kind: RunFailureKind
  readonly line: string
}

/** The worker's report when `WebAssembly.instantiate` rejected with `error`. */
export const instantiateFailure = (error: unknown): FailedReport => ({
  type: 'failed',
  kind: refusedMemory(error) ? 'memory' : 'instantiate',
  line: instantiateFailureLine(error),
})

/** The worker's report when writing the stream into the module's slot threw `error`. */
export const writeFailure = (error: unknown): FailedReport => ({
  type: 'failed',
  kind: error instanceof SlotMismatchError ? 'mismatch' : 'write',
  line: `Could not write the replay into the module: ${messageOf(error)}`,
})

/** The worker's report when the game threw `error`. */
export const stopFailure = (error: unknown): FailedReport => ({
  type: 'failed',
  kind: 'stopped',
  line: `The game stopped: ${messageOf(error)}`,
})

/** The worker's report when AgbMain returned. */
export const RETURNED: FailedReport = {
  type: 'failed',
  kind: 'returned',
  line: 'AgbMain returned, which the game never does',
}

/** A failed run on the page, made from the worker's report: its kind, and its line as the message. */
export class RunFailure extends Error {
  override name = 'RunFailure'
  readonly kind: FailedReport['kind']

  constructor(report: Pick<FailedReport, 'kind' | 'line'>) {
    super(report.line)
    this.kind = report.kind
  }
}

/** The browser ran out of memory while the page built the game; its line speaks to visitors. */
export class MemoryRefusal extends Error {
  override name = 'MemoryRefusal'
}

/**
 * What the page shows when applying the patch to the dump or compiling the module threw `error`:
 * a refused memory as its own line, any other failure as it came. A browser does not fire a
 * file field's change for the same file, so the remedy loads the page again.
 */
export function buildFailure(error: unknown): unknown {
  if (!refusedMemory(error)) return error
  return new MemoryRefusal(
    'This browser ran out of memory while it built the game from your dump ' +
      `(${messageOf(error)}). Close other tabs or apps, then load the page again and pick your ` +
      'dump.',
  )
}
