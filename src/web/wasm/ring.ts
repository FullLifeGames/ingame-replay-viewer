// The audio ring of the WebAssembly spike page (#35): the game's sound on its way from the worker
// to the audio thread, in a SharedArrayBuffer that both see. A header of counters comes first,
// then the float samples. DOM-free, so the worker, the worklet and the Node harness share it.

// The ring's header: the samples written and read so far, the overruns, the samples the reader
// skipped to hold its latency cap, and its underruns (dry spells). The written and read counters
// are Int32 words that wrap at 2^32; with a capacity that is a power of two, a counter masked by
// the capacity gives its sample's place on either side of the wrap.
const RING = { written: 0, read: 1, overruns: 2, skipped: 3, underruns: 4 } as const
const RING_HEADER_BYTES = 4 * Object.keys(RING).length
// A larger capacity would let the fill reach 2^31, which a signed Int32 cannot hold.
const MAX_CAPACITY = 2 ** 30

const isPowerOfTwo = (n: number) =>
  Number.isInteger(n) && n >= 2 && n <= MAX_CAPACITY && (n & (n - 1)) === 0

/** The bytes of a ring of `capacity` samples, its header included. */
export function ringBytes(capacity: number): number {
  if (!isPowerOfTwo(capacity)) {
    throw new Error(
      `the audio ring needs a power of two from 2 on as its capacity, not ${String(capacity)}`,
    )
  }
  return RING_HEADER_BYTES + 4 * capacity
}

/** What a trim at the latency cap `limit` leaves waiting: half of it, in whole pairs. */
export const trimFloor = (limit: number): number => 2 * Math.floor(limit / 4)

/**
 * A ring of float samples from one writer (the worker) to one reader (the audio thread). The
 * game's sound goes in as left and right pairs; a power of two is even, so every push and pull
 * of whole pairs keeps them whole.
 */
export class AudioRing {
  readonly capacity: number
  private readonly mask: number
  private readonly header: Int32Array
  private readonly samples: Float32Array

  constructor(buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, Object.keys(RING).length)
    this.samples = new Float32Array(buffer, RING_HEADER_BYTES)
    this.capacity = this.samples.length
    this.mask = this.capacity - 1
  }

  /** The pushes that found the ring full and dropped samples. */
  get overruns(): number {
    return Atomics.load(this.header, RING.overruns)
  }

  /** The samples the reader skipped to hold its latency cap (trim). */
  get skipped(): number {
    return Atomics.load(this.header, RING.skipped)
  }

  /**
   * The dry spells: the times the reader found the ring empty while it played. Each one lasts
   * until the reserve waits again, and counts once.
   */
  get underruns(): number {
    return Atomics.load(this.header, RING.underruns)
  }

  /** The samples written since the ring was made, modulo 2^32. */
  get totalWritten(): number {
    return Atomics.load(this.header, RING.written) >>> 0
  }

  /** The samples read since the ring was made, modulo 2^32. */
  get totalRead(): number {
    return Atomics.load(this.header, RING.read) >>> 0
  }

  /** The samples written and not yet read. */
  get waiting(): number {
    return this.between(
      Atomics.load(this.header, RING.written),
      Atomics.load(this.header, RING.read),
    )
  }

  /** Copies the newest samples written into the end of `out`, read or not; returns how many. */
  recent(out: Float32Array): number {
    const written = Atomics.load(this.header, RING.written)
    const count = Math.min(out.length, this.totalWritten, this.capacity)
    const start = out.length - count
    for (let i = 0; i < count; i++) {
      out[start + i] = this.samples[(written - count + i) & this.mask] ?? 0
    }
    return count
  }

  /** Writes what fits; returns the samples it dropped, and counts an overrun when it dropped some. */
  push(input: Float32Array): number {
    const written = Atomics.load(this.header, RING.written)
    const free = this.capacity - this.between(written, Atomics.load(this.header, RING.read))
    const count = Math.min(free, input.length)
    for (let i = 0; i < count; i++) this.samples[(written + i) & this.mask] = input[i] ?? 0
    Atomics.store(this.header, RING.written, (written + count) | 0)
    const dropped = input.length - count
    if (dropped > 0) Atomics.add(this.header, RING.overruns, 1)
    return dropped
  }

  /** Reads up to `out.length` samples into `out`; returns how many. */
  pull(out: Float32Array): number {
    const read = Atomics.load(this.header, RING.read)
    const count = Math.min(out.length, this.between(Atomics.load(this.header, RING.written), read))
    for (let i = 0; i < count; i++) out[i] = this.samples[(read + i) & this.mask] ?? 0
    Atomics.store(this.header, RING.read, (read + count) | 0)
    return count
  }

  /**
   * The reader's side, before it pulls: when more than `limit` samples wait, skips the oldest
   * down to `trimFloor(limit)`, and returns how many it skipped. The writer only reads the read
   * counter to find its free space, which a skip only grows.
   */
  trim(limit: number): number {
    const read = Atomics.load(this.header, RING.read)
    const waiting = this.between(Atomics.load(this.header, RING.written), read)
    if (waiting <= limit) return 0
    const skip = waiting - trimFloor(limit)
    Atomics.store(this.header, RING.read, (read + skip) | 0)
    Atomics.add(this.header, RING.skipped, skip)
    return skip
  }

  /** The reader's side: it found the ring empty `spells` times while it played. */
  countUnderruns(spells: number): void {
    if (spells > 0) Atomics.add(this.header, RING.underruns, spells)
  }

  /** The samples written and not yet read, on either side of the counters' wrap. */
  private between(written: number, read: number): number {
    return (written - read) | 0
  }
}
