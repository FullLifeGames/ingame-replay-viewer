// The PSG of our platform layer (#43, plan B7) as the specs drive it through the harness's
// `script` command: the sound registers by their 8-bit names (GBATEK "GBA Sound Channel 1 - Tone
// & Sweep" to "GBA Sound Channel 4 - Noise", "GBA Sound Control Registers"), and a run that
// returns the left and right samples apart.
import {
  asFloats,
  load,
  type Op,
  psgFrame,
  PSG_PAIR_BYTES,
  psgReset,
  runScript,
} from './wasm-layer-script.ts'
import { IO } from './wasm-layer-video.ts'

export const NR = {
  10: IO + 0x60,
  11: IO + 0x62,
  12: IO + 0x63,
  13: IO + 0x64,
  14: IO + 0x65,
  21: IO + 0x68,
  22: IO + 0x69,
  23: IO + 0x6c,
  24: IO + 0x6d,
  30: IO + 0x70,
  31: IO + 0x72,
  32: IO + 0x73,
  33: IO + 0x74,
  34: IO + 0x75,
  41: IO + 0x78,
  42: IO + 0x79,
  43: IO + 0x7c,
  44: IO + 0x7d,
  50: IO + 0x80,
  51: IO + 0x81,
} as const
export const SOUNDCNT_H = IO + 0x82
export const SOUNDCNT_X = IO + 0x84
export const WAVE_RAM = IO + 0x90

/** One channel at volume 15 under full volume settings: GBATEK's 0x80 ("Max Output Levels"). */
export const FULL = 0x80

export const write8 = (address: number, value: number): Op => load(address, [value])

/** The low and high frequency bytes, the high one with `control`'s bits 6 and 7. */
export const frequency = (low: number, n: number, control: number): Op[] => [
  write8(low, n & 0xff),
  write8(low + 1, (n >> 8) | control),
]

/** Master on, both sides at volume 7 with all four channels, the PSG at 100 %. */
const POWER_ON: Op[] = [
  write8(SOUNDCNT_X, 0x80),
  write8(NR[50], 0x77),
  write8(NR[51], 0xff),
  write8(SOUNDCNT_H, 0x02),
]

/** A step of a PSG script: its operations, then a frame of `pairs` pairs if it names one. */
interface PsgStep {
  ops: Op[]
  pairs?: number
}

interface PsgRun {
  left: number[]
  right: number[]
  /** The bytes of the script's read operations, in order. */
  reads: number[]
}

/** Runs the steps on a PSG reset to `rate`, after POWER_ON. `readBytes` counts the reads. */
export function runPsg(host: string, rate: number, steps: PsgStep[], readBytes = 0): PsgRun {
  const ops: Op[] = [psgReset(rate), ...POWER_ON]
  const frames: number[] = []
  for (const step of steps) {
    ops.push(...step.ops)
    if (step.pairs !== undefined) {
      ops.push(psgFrame(step.pairs))
      frames.push(ops.length - 1)
    }
  }
  const pairs = steps.reduce((sum, step) => sum + (step.pairs ?? 0), 0)
  const { dest } = runScript(host, ops, pairs * PSG_PAIR_BYTES + readBytes)
  return splitRun(ops, dest)
}

/** Takes the appended bytes apart again: floats of each frame, bytes of each read. */
function splitRun(ops: Op[], dest: Uint8Array): PsgRun {
  const run: PsgRun = { left: [], right: [], reads: [] }
  let at = 0
  for (const op of ops) {
    const length =
      op[0] === 12 ? (op[1] as number) * PSG_PAIR_BYTES : op[0] === 6 ? (op[2] as number) : 0
    const bytes = dest.subarray(at, at + length)
    at += length
    if (op[0] === 6) run.reads.push(...bytes)
    if (op[0] !== 12) continue
    const floats = asFloats(bytes)
    run.left.push(...floats.filter((_, i) => i % 2 === 0))
    run.right.push(...floats.filter((_, i) => i % 2 === 1))
  }
  return run
}
