// The game's sound on its way out of the WebAssembly spike page (#35): the worker's hook takes
// each frame's samples from the module's memory into the audio ring (ring.ts), and the
// audio worklet resamples them from the mixer's rate to the audio context's. DOM-free, so the
// worker, the worklet and the Node harness share it.
import { MIXER_RATE, readPace, type SharedBuffers } from './protocol.ts'
import { AudioRing } from './ring.ts'

/** The name the audio worklet registers its processor under. */
export const AUDIO_PROCESSOR = 'irv-audio'

/** What the page hands the processor: the run's audio ring and the rate its samples have. */
export interface AudioProcessorOptions {
  readonly ring: SharedArrayBuffer
  readonly rate: number
}

/**
 * The samples of one frame at a pace: all of them at 1, every other left and right pair at 2,
 * so that twice the frames play in the same time at twice the pitch, and none at 0.
 */
export function paceSamples(samples: Float32Array, pace: number): Float32Array {
  if (pace === 1) return samples
  if (pace <= 0) return new Float32Array(0)
  const pairs = Math.ceil(samples.length / 2 / pace)
  const out = new Float32Array(pairs * 2)
  for (let pair = 0; pair < pairs; pair++) {
    out[pair * 2] = samples[pair * pace * 2] ?? 0
    out[pair * 2 + 1] = samples[pair * pace * 2 + 1] ?? 0
  }
  return out
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
  return (samples, count, rate) => {
    if (rate !== MIXER_RATE) {
      throw new Error(
        `the game mixes at ${String(rate)} Hz, and the page resamples from ${String(MIXER_RATE)} Hz`,
      )
    }
    const pace = readPace(control)
    if (pace === 0) return
    const memory = game().HEAPU8
    ring.push(
      paceSamples(new Float32Array(memory.buffer, memory.byteOffset + samples, count), pace),
    )
  }
}

/** One left and right pair, and whether it came from the ring. */
interface Pair {
  left: number
  right: number
  dry: boolean
}

/** Linear resampling from the ring's left and right pairs at `from` Hz to two outputs at `to` Hz. */
export class Resampler {
  /** The output frames that had no sample in the ring and played silence. */
  missed = 0
  private readonly step: number
  private readonly scratch = new Float32Array(2)
  private previous: Pair | undefined
  private next: Pair | undefined
  private fraction = 0

  private readonly ring: AudioRing

  constructor(ring: AudioRing, from: number, to: number) {
    if (!(from > 0 && to > 0)) {
      throw new Error(
        `the resampler needs two positive rates, not ${String(from)} Hz and ${String(to)} Hz`,
      )
    }
    this.ring = ring
    this.step = from / to
  }

  /** Fills `left` and `right`, which have the same length. */
  fill(left: Float32Array, right: Float32Array): void {
    let previous = (this.previous ??= this.take())
    let next = (this.next ??= this.take())
    for (let i = 0; i < left.length; i++) {
      if (previous.dry) this.missed++
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
  }

  private take(): Pair {
    if (this.ring.pull(this.scratch) < 2) return { left: 0, right: 0, dry: true }
    return { left: this.scratch[0] ?? 0, right: this.scratch[1] ?? 0, dry: false }
  }
}

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
