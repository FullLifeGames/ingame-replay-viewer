// The audio ring of the WebAssembly spike page (#35): the game's sound on its way from the worker
// to the audio thread, in a SharedArrayBuffer that both see. A header of counters comes first,
// then the float samples. DOM-free, so the worker, the worklet and the Node harness share it.

// The ring's header: the samples written and read so far, and the overruns.
const RING = { written: 0, read: 1, overruns: 2 } as const
const RING_HEADER_BYTES = 4 * Object.keys(RING).length

/** The bytes of a ring of `capacity` samples, its header included. */
export function ringBytes(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error(`the audio ring needs a capacity of 1 or more samples, not ${String(capacity)}`)
  }
  return RING_HEADER_BYTES + 4 * capacity
}

/**
 * A ring of float samples from one writer (the worker) to one reader (the audio thread). The
 * game's sound goes in as left and right pairs; with an even capacity, every push and pull of
 * whole pairs keeps them whole.
 */
export class AudioRing {
  readonly capacity: number
  private readonly header: Int32Array
  private readonly samples: Float32Array

  constructor(buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, Object.keys(RING).length)
    this.samples = new Float32Array(buffer, RING_HEADER_BYTES)
    this.capacity = this.samples.length
  }

  get overruns(): number {
    return Atomics.load(this.header, RING.overruns)
  }

  /** The samples written since the ring was made. */
  get totalWritten(): number {
    return Atomics.load(this.header, RING.written)
  }

  /** The samples read since the ring was made. */
  get totalRead(): number {
    return Atomics.load(this.header, RING.read)
  }

  /** Copies the newest samples written into the end of `out`, read or not; returns how many. */
  recent(out: Float32Array): number {
    const written = this.totalWritten
    const count = Math.min(out.length, written, this.capacity)
    const start = out.length - count
    for (let i = 0; i < count; i++) {
      out[start + i] = this.samples[(written - count + i) % this.capacity] ?? 0
    }
    return count
  }

  /** Writes what fits; returns the samples it dropped, and counts an overrun when it dropped some. */
  push(input: Float32Array): number {
    const written = Atomics.load(this.header, RING.written)
    const free = this.capacity - (written - Atomics.load(this.header, RING.read))
    const count = Math.min(free, input.length)
    for (let i = 0; i < count; i++) this.samples[(written + i) % this.capacity] = input[i] ?? 0
    Atomics.store(this.header, RING.written, written + count)
    const dropped = input.length - count
    if (dropped > 0) Atomics.add(this.header, RING.overruns, 1)
    return dropped
  }

  /** Reads up to `out.length` samples into `out`; returns how many. */
  pull(out: Float32Array): number {
    const read = Atomics.load(this.header, RING.read)
    const count = Math.min(out.length, Atomics.load(this.header, RING.written) - read)
    for (let i = 0; i < count; i++) out[i] = this.samples[(read + i) % this.capacity] ?? 0
    Atomics.store(this.header, RING.read, read + count)
    return count
  }
}
