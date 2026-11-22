// The hand-over of the game's frames from the worker to the page through two buffers (#48), so
// the page never copies a frame the worker is still widening. The `front` word names the buffer
// with the newest whole frame and the `reading` word the buffer the page copies. Each side stores
// its own word before it loads the other's, and Atomics keeps one order of those steps for both
// threads, so neither side misses the other. DOM-free; protocol.ts holds the layout.
import { FRAME_BYTES } from './frame.ts'
import { CONTROL, NOT_READING } from './protocol.ts'

/** Frame buffer `index` (0 or 1) of the shared frames. */
export const frameBuffer = (frames: SharedArrayBuffer, index: number): Uint8Array =>
  new Uint8Array(frames, index * FRAME_BYTES, FRAME_BYTES)

/** The worker's side: the buffer the next frame goes into, the one not in front. */
export const backBuffer = (control: Int32Array): number => 1 - Atomics.load(control, CONTROL.front)

/**
 * The worker's side, before it widens a frame into buffer `index`: returns once the page does not
 * copy that buffer, or false after `timeoutMs`. Blocks the worker's thread while it waits.
 */
export function waitUntilUnread(control: Int32Array, index: number, timeoutMs = Infinity): boolean {
  const end = performance.now() + timeoutMs
  while (Atomics.load(control, CONTROL.reading) === index) {
    const left = end - performance.now()
    if (left <= 0) return false
    Atomics.wait(control, CONTROL.reading, index, left)
  }
  return true
}

/** The worker's side: buffer `index` holds a whole frame now and goes in front. */
export function publishFrame(control: Int32Array, index: number): void {
  Atomics.store(control, CONTROL.front, index)
}

function setReading(control: Int32Array, index: number): void {
  Atomics.store(control, CONTROL.reading, index)
  Atomics.notify(control, CONTROL.reading)
}

/**
 * The page's side: claims the buffer in front and returns it. When the worker put another buffer
 * in front before the claim was stored, the page claims that one instead, so it holds the newest.
 */
export function claimFrame(control: Int32Array): number {
  let front = Atomics.load(control, CONTROL.front)
  for (;;) {
    setReading(control, front)
    const now = Atomics.load(control, CONTROL.front)
    if (now === front) return front
    front = now
  }
}

/** The page's side: done copying, so the worker may widen into the buffer again. */
export const releaseFrame = (control: Int32Array): void => {
  setReading(control, NOT_READING)
}

/** The page's one way to the frame: copies the newest whole frame into `into`, RGBA. */
export function readFrame(
  control: Int32Array,
  frames: SharedArrayBuffer,
  into: Uint8Array | Uint8ClampedArray,
): void {
  if (into.length !== FRAME_BYTES) {
    throw new Error(`a frame takes ${String(FRAME_BYTES)} bytes, not ${String(into.length)}`)
  }
  const index = claimFrame(control)
  into.set(frameBuffer(frames, index))
  releaseFrame(control)
}
