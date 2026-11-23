// The messages between the viewer and its worker (#35). The page sends one start
// message to a fresh worker; after it, frames and progress go through the shared buffers of
// protocol.ts, since AgbMain never returns and the worker reads no further message.
import type { SlotDescription } from '../../patch/slot'
import type { SharedBuffers } from './protocol'

/** The page's one message to a fresh worker. */
export interface StartMessage {
  readonly type: 'start'
  /** The module, compiled by the page from the dump and the patch. */
  readonly module: WebAssembly.Module
  /** The absolute URL of the Emscripten glue, /wasm/irv-emerald.js. */
  readonly glueUrl: string
  readonly stream: Uint8Array
  /** replay-slot.json of the ROM build: the same slot layout as in the module. */
  readonly slot: SlotDescription
  readonly buffers: SharedBuffers
}

/** The worker's messages to the page. Frames and progress go through the shared buffers. */
export type WorkerReport =
  { readonly type: 'running' } | { readonly type: 'failed'; readonly line: string }
