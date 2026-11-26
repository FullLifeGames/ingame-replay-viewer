// The Gen 5 page's worker that unpacks the emulator's core in place of EmulatorJS's
// data/compression/extract7z.js (#79): the page names it through window.EJS_paths, and EmulatorJS
// fetches it as text and starts it from a Blob URL as a classic worker. So scripts/gen5-built.ts
// bundles it into one script without import or export, for the build and for the dev server. The
// logic is src/gen5/core-unpack.ts; the last report stays on the worker's global scope under
// the name UNPACK_REPORT gives, for the scripts to read.
import {
  UNPACK_REPORT,
  unpackCore,
  type UnpackGlobal,
  type UnpackMessage,
} from '../../gen5/core-unpack.ts'

/** The dedicated worker's global scope, as far as the unpacker uses it. */
interface WorkerScope extends UnpackGlobal {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  postMessage(message: UnpackMessage, options: { transfer: ArrayBuffer[] }): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  scope[UNPACK_REPORT] = unpackCore(event.data, {
    post: (message, transfer) => {
      scope.postMessage(message, { transfer: [...transfer] })
    },
    now: () => performance.now(),
  })
}
