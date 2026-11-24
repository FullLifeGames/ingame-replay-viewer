// The game's sound on its way out of the viewer (#35): the worker's hook takes
// each frame's samples from the module's memory into the audio ring (ring.ts), and the
// audio worklet resamples them from the mixer's rate to the audio context's. DOM-free, so the
// worker, the worklet and the Node harness share it.
import { HalfBand } from './half-band.ts'
import { MIXER_RATE, readPace, type SharedBuffers } from './protocol.ts'
import { AudioRing, trimFloor } from './ring.ts'

/** The name the audio worklet registers its processor under. */
export const AUDIO_PROCESSOR = 'irv-audio'

/** The message on the processor's port after which it plays no more (RingReader.stop). */
export const AUDIO_STOP = 'stop'

/**
 * What the page hands the processor: the run's audio ring, the rate its samples have, the
 * latency cap (the samples that may wait in the ring) and the reserve (the samples that must wait
 * before it plays, at the start and after a dry spell). Both count left and right apart.
 */
export interface AudioProcessorOptions {
  readonly ring: SharedArrayBuffer
  readonly rate: number
  readonly latency: number
  readonly reserve: number
}

/**
 * The samples of each frame at the page's pace: all of them at 1, one filtered pair of each two at
 * 2 (half-band.ts), so that twice the frames play in the same time at twice the pitch, and none at
 * 0. The filter's history runs from frame to frame and starts afresh when the pace changes.
 */
export class SoundPace {
  private pace = 1
  private readonly halfBand = new HalfBand()

  apply(samples: Float32Array, pace: number): Float32Array {
    if (pace !== this.pace) this.halfBand.reset()
    this.pace = pace
    if (pace === 1) return samples
    if (pace === 2) return this.halfBand.decimate(samples)
    if (pace === 0) return new Float32Array(0)
    throw new Error(
      `the page asks for the sound at pace ${String(pace)}, and the worker plays it at 0, 1 or 2`,
    )
  }
}

/** What the audio hook reads of the module. */
interface ModuleMemory {
  HEAPU8: Uint8Array
}

/**
 * The worker's irvAudio (irv_wasm_sound.c): `count` floats at the address `samples`, mixed at
 * `rate`, into the ring at the pace the page asks for.
 */
export function audioHandler(
  game: () => ModuleMemory,
  buffers: SharedBuffers,
): (samples: number, count: number, rate: number) => void {
  const control = new Int32Array(buffers.control)
  const ring = new AudioRing(buffers.audio)
  const sound = new SoundPace()
  return (samples, count, rate) => {
    if (rate !== MIXER_RATE) {
      throw new Error(
        `the game mixes at ${String(rate)} Hz, and the page resamples from ${String(MIXER_RATE)} Hz`,
      )
    }
    const memory = game().HEAPU8
    const frame = new Float32Array(memory.buffer, memory.byteOffset + samples, count)
    ring.push(sound.apply(frame, readPace(control)))
  }
}

/** One left and right pair, and whether it came from the ring. */
interface Pair {
  left: number
  right: number
  dry: boolean
}

/**
 * Linear resampling from the ring's left and right pairs at `from` Hz to two outputs at `to` Hz.
 * It plays silence until `reserve` samples wait in the ring, at the start and after each dry
 * spell, so a frame that comes a little late from the worker plays on time. A dry spell counts as
 * one underrun, however long it lasts; the wait at the start counts as none.
 */
export class Resampler {
  private readonly step: number
  private readonly scratch = new Float32Array(2)
  private previous: Pair | undefined
  private next: Pair | undefined
  private fraction = 0
  private refilling = true

  private readonly ring: AudioRing
  // One pair at least, so a reader that starts to play has a pair to play.
  private readonly reserve: number

  constructor(ring: AudioRing, from: number, to: number, reserve = 0) {
    if (!(from > 0 && to > 0)) {
      throw new Error(
        `the resampler needs two positive rates, not ${String(from)} Hz and ${String(to)} Hz`,
      )
    }
    this.ring = ring
    this.step = from / to
    this.reserve = Math.max(reserve, 2)
  }

  /** Fills `left` and `right`, which have the same length. */
  fill(left: Float32Array, right: Float32Array): void {
    let played = 0
    while (played < left.length && this.ready()) played = this.play(left, right, played)
    left.fill(0, played)
    right.fill(0, played)
  }

  /** Whether it plays: once the reserve waits, until the ring runs dry. */
  private ready(): boolean {
    if (this.refilling && this.ring.waiting >= this.reserve) {
      this.refilling = false
      this.fraction = 0
    }
    return !this.refilling
  }

  /** Plays from output frame `from` on until the outputs are full or the ring runs dry. */
  private play(left: Float32Array, right: Float32Array, from: number): number {
    this.forgetDry()
    let previous = (this.previous ??= this.take())
    let next = (this.next ??= this.take())
    for (let i = from; i < left.length; i++) {
      if (previous.dry) return this.runDry(next, i)
      left[i] = previous.left + (next.left - previous.left) * this.fraction
      right[i] = previous.right + (next.right - previous.right) * this.fraction
      this.fraction += this.step
      for (; this.fraction >= 1; this.fraction -= 1) {
        previous = next
        next = this.take()
      }
    }
    this.previous = previous
    this.next = next
    return left.length
  }

  /**
   * Drops the pairs a take found dry at the end of the last call, keeping their order, so the
   * pairs the worker pushed since then play and no dry spell counts.
   */
  private forgetDry(): void {
    if (this.previous?.dry) {
      this.previous = this.next?.dry === false ? this.next : undefined
      this.next = undefined
    }
    if (this.next?.dry) this.next = undefined
  }

  /** Counts the dry spell and waits for the reserve; a pair that came meanwhile plays first. */
  private runDry(next: Pair, at: number): number {
    this.ring.countUnderruns(1)
    this.refilling = true
    this.previous = next.dry ? undefined : next
    this.next = undefined
    return at
  }

  private take(): Pair {
    if (this.ring.pull(this.scratch) < 2) return { left: 0, right: 0, dry: true }
    return { left: this.scratch[0] ?? 0, right: this.scratch[1] ?? 0, dry: false }
  }
}

/**
 * The audio worklet's processor without the worklet: each call plays the ring into the left and
 * right outputs, after it held the ring at the latency cap, with the reserve of the resampler.
 * Once stopped, it plays no more and returns false, which lets the audio thread drop the processor.
 */
export class RingReader {
  private readonly ring: AudioRing
  private readonly resampler: Resampler
  private readonly latency: number
  private stopped = false

  constructor(options: AudioProcessorOptions, outputRate: number) {
    const { latency, reserve } = options
    const floor = trimFloor(latency)
    if (reserve > floor) {
      throw new Error(
        `the audio reserve of ${String(reserve)} samples is above the ${String(floor)} samples ` +
          `a trim at the latency cap of ${String(latency)} leaves, ` +
          'so the worklet could wait for it for good',
      )
    }
    this.ring = new AudioRing(options.ring)
    this.resampler = new Resampler(this.ring, options.rate, outputRate, reserve)
    this.latency = latency
  }

  stop(): void {
    this.stopped = true
  }

  process(outputs: Float32Array[][]): boolean {
    if (this.stopped) return false
    const [left, right] = outputs[0] ?? []
    if (left === undefined) return true
    this.ring.trim(this.latency)
    this.resampler.fill(left, right ?? new Float32Array(left.length))
    return true
  }
}

const counted = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`

/** The sound's counts on the page's progress line while sound plays (#47). */
export const soundLine = ({ skipped, underruns }: { skipped: number; underruns: number }): string =>
  `The page skipped ${counted(skipped, 'sound sample', 'sound samples')} and ran out of sound ${counted(underruns, 'time', 'times')}.`

/** The count and the root mean square of the samples a host saw. */
export class AudioMeter {
  samples = 0
  private squares = 0

  add(samples: Float32Array): void {
    for (const sample of samples) this.squares += sample * sample
    this.samples += samples.length
  }

  get rms(): number {
    return this.samples === 0 ? 0 : Math.sqrt(this.squares / this.samples)
  }
}
