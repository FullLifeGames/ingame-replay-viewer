// The PCM mixer and the frame of our platform layer's sound engine (#43, plan B8b), run natively
// in the host harness: the envelope, the samples with their pitch, the compressed samples, the
// reverb, the output to the host and the sequencer's channels ending (MP2K spec 6-8, 10, 11).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  added,
  mixerInfo,
  MONO,
  outputLevel,
  runMixer,
  STEREO,
  type Wave,
  waveBytes,
} from './wasm-layer-mixer.ts'
import { CMD, N, pcmAt, runSound, trackAt, W } from './wasm-layer-mp2k.ts'
import { asWords, load, read, runScript } from './wasm-layer-script.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-mixer-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const WAVE = 0x02011000
const START = 0x80
const STOP = 0x40
const ECHO = 0x04
const FIX = 0x08
const CMP = 0x20
const ONE = 2 ** 23
/** Full attack: the level is 255 after the first frame (MP2K spec 6.4). */
const FULL = outputLevel(255, 255)
const pseudoRandom = (count: number) =>
  Array.from({ length: count }, (_, i) => ((i * 37) % 256) - 128)

describe('the samples and their pitch (MP2K spec 6.5, 6.6)', () => {
  it("plays an 8-bit sample at the mixer's rate at its pitch, interpolated, 0.25 % fast", () => {
    const data = pseudoRandom(2000)
    const wave: Wave = { size: 2000, data: [...data, 0, 0, 0, 0] }
    const [frame] = runMixer(
      host,
      { channels: [{ wave: WAVE, frequency: 42048 }], waves: [{ at: WAVE, wave }] },
      1,
    )
    const step = 200 * 42048
    const expected = Array.from({ length: 704 }, (_, k) => {
      const at = Math.floor((k * step) / ONE)
      const fraction = (k * step) % ONE
      const [s0, s1] = [data[at] ?? 0, data[at + 1] ?? 0]
      return added(FULL, s0 + Math.floor((fraction * (s1 - s0)) / ONE))
    })
    expect(frame?.right).toEqual(expected)
    expect(frame?.left).toEqual(expected)
    expect(frame?.chans[0]).toMatchObject({ status: 2, envelope: 255, count: 2000 - 705 })
    expect(frame?.chans[0]?.fraction).toBe(704 * step - 705 * ONE)
  })

  it('loops a looping sample from its loop start and keeps the overshoot', () => {
    const wave: Wave = { size: 8, loopStart: 4, loop: true, data: [10, 20, 30, 40, 50, 60, 70, 80] }
    const channels = [{ type: FIX, wave: WAVE }]
    const [frame] = runMixer(
      host,
      { mixer: { samples: 16 }, channels, waves: [{ at: WAVE, wave }] },
      1,
    )
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 50, 60, 70, 80, 50, 60, 70, 80]
    expect(frame?.right).toEqual(values.map((value) => added(FULL, value)))
    expect(frame?.chans[0]).toMatchObject({ status: 0x10 | 2, count: 4 })
  })
})

// Hand-decoded with gDeltaEncodingTable (0, 1, 4, 9, 16, 25, 36, 49, -64, -49, -36, -25, -16,
// -9, -4, -1), the sums wrapping modulo 256 (MP2K spec 2.5).
const BLOCK_0 = [100, 0x07, 0x77, 0x88, 0x9f, 0x01, ...new Array<number>(27).fill(0)]
const DECODED_0 = [100, -107, -58, -9, -73, 119, 70, 69, 69, 70, ...new Array<number>(54).fill(70)]
// A cry's short last block (built with --no-pad): samples 64-68 need four bytes, and the low
// nibble of the fourth gives sample 69, past the end. Then the bytes that follow the data.
const BLOCK_1 = [-20, 0x02, 0x1e, 0x3a]
const DECODED_1 = [-20, -16, -15, -19, -10]
const PAST_END = -46
const FOLLOWING = [0x55, 0x55, 0x55, 0x55]
const cry: Wave = { compressed: true, size: 69, data: [...BLOCK_0, ...BLOCK_1, ...FOLLOWING] }

describe('compressed samples (MP2K spec 2.5, 6.5, 10 O3)', () => {
  it('decodes two blocks to the bytes of gDeltaEncodingTable and ends at the sample end', () => {
    const channels = [{ type: CMP | FIX, wave: WAVE }]
    const [frame] = runMixer(host, { channels, waves: [{ at: WAVE, wave: cry }] }, 1)
    const values = [...DECODED_0, ...DECODED_1].map((value) => added(FULL, value))
    expect(frame?.right.slice(0, 70)).toEqual([...values, 0])
    expect(frame?.chans[0]?.status).toBe(0)
  })

  it('interpolates the last sample towards the decoded byte past the end of a short block', () => {
    const channels = [{ type: CMP, wave: WAVE, frequency: 2 ** 22 }]
    const mixer = { divFreq: 1 }
    const [frame] = runMixer(host, { mixer, channels, waves: [{ at: WAVE, wave: cry }] }, 1)
    const last = DECODED_1[4] ?? 0
    const halfway = (from: number, to: number) => from + Math.floor((to - from) / 2)
    const values = [-19, halfway(-19, last), last, halfway(last, PAST_END), 0]
    expect(frame?.right.slice(134, 139)).toEqual(values.map((value) => added(FULL, value)))
    expect(frame?.chans[0]?.status).toBe(0)
  })
})

describe('the envelope (MP2K spec 6.4)', () => {
  it('releases to the echo volume, holds it for the echo length, then turns off', () => {
    const channels = [
      {
        status: STOP | 1,
        level: 200,
        envelope: [0, 0, 0, 128],
        echo: [40, 3],
        wave: WAVE,
        offset: 50_000,
      },
    ]
    const wave: Wave = { size: 100_000, data: [] }
    const frames = runMixer(host, { channels, waves: [{ at: WAVE, wave }] }, 6)
    expect(frames.map((frame) => frame.chans[0]?.envelope)).toEqual([100, 50, 40, 40, 40, 40])
    const flags = STOP | 1
    expect(frames.map((frame) => frame.chans[0]?.status)).toEqual([
      flags,
      flags,
      flags | ECHO,
      flags | ECHO,
      flags | ECHO,
      0,
    ])
  })

  it('turns a channel off that starts and stops in one frame, and mixes nothing', () => {
    const channels = [{ status: START | STOP, wave: WAVE }]
    const [frame] = runMixer(
      host,
      { channels, waves: [{ at: WAVE, wave: { size: 10, data: pseudoRandom(10) } }] },
      1,
    )
    expect(frame?.chans[0]?.status).toBe(0)
    expect(frame?.right.every((byte) => byte === 0)).toBe(true)
  })
})

describe('the frame: segments, reverb and the output (MP2K spec 6.2, 6.3, 7, 8.1)', () => {
  const short = (reverb: number) =>
    runMixer(
      host,
      {
        mixer: { reverb, samples: 32 },
        channels: [{ type: FIX, wave: WAVE }],
        waves: [{ at: WAVE, wave: { size: 20, data: pseudoRandom(20).map((value) => -value) } }],
      },
      4,
    )

  it('writes segment 1, then 0, one frame ahead of the DMA', () => {
    expect(short(0).map((frame) => frame.counter)).toEqual([2, 1, 2, 1])
  })

  it('clears the segment when reverb is 0', () => {
    const frames = short(0)
    expect(frames[0]?.right.slice(0, 3)).not.toEqual([0, 0, 0])
    expect(frames[2]?.right.every((byte) => byte === 0)).toBe(true)
  })

  it("mixes this segment's and the next one's halves into both halves with reverb", () => {
    const frames = short(50)
    for (const n of [1, 2, 3]) {
      const before = frames[n - 1]?.buffer ?? new Int8Array()
      const segment = frames[n]?.counter === 2 ? 1 : 0
      const other = (segment + 1) % 2
      const expected = Array.from({ length: 32 }, (_, k) => {
        const at = (s: number) => (before[s * 32 + k] ?? 0) + (before[1584 + s * 32 + k] ?? 0)
        const level = Math.floor(((at(segment) + at(other)) * 50) / 512)
        return level < 0 ? level + 1 : level
      })
      expect(frames[n]?.right).toEqual(expected)
      expect(frames[n]?.left).toEqual(expected)
    }
    expect(frames[2]?.right.some((byte) => byte !== 0)).toBe(true)
  })

  it("hands 704 pairs at 42048 Hz to the host, each FIFO's byte 4 units at 100 % over the bias", () => {
    const channels = [{ wave: WAVE, frequency: 42048, volume: [255, 0] }]
    const waves = [{ at: WAVE, wave: { size: 2000, data: pseudoRandom(2000) } }]
    const [stereo] = runMixer(host, { channels, waves, control: STEREO }, 1)
    expect(stereo?.rate).toBe(42048)
    expect(stereo?.audio).toHaveLength(1408)
    const right = stereo?.right ?? []
    expect(stereo?.audio.filter((_, i) => i % 2 === 1)).toEqual(
      right.map((byte) => (byte * 4) / 512),
    )
    expect(stereo?.audio.filter((_, i) => i % 2 === 0).every((level) => level === 0)).toBe(true)
    const [mono] = runMixer(host, { channels, waves, control: MONO }, 1)
    const both = right.map((byte) => (byte * 2) / 512)
    expect(mono?.audio.filter((_, i) => i % 2 === 0)).toEqual(both)
    expect(mono?.audio.filter((_, i) => i % 2 === 1)).toEqual(both)
  })

  it('SoundMainBTM clears the 64 bytes at its argument', () => {
    const at = 0x02020000
    const { dest } = runScript(
      host,
      [load(at, new Array<number>(68).fill(0xaa)), [13, 7, at, 0], read(at, 68)],
      68,
    )
    expect(asWords(dest)).toEqual([...new Array<number>(16).fill(0), 0xaaaaaaaa])
  })
})

describe("the sequencer's channels end in the mixer (MP2K spec 5.2, 6.4, 11)", () => {
  const { FINE, TIE, VOICE } = CMD
  interface Note {
    type: number
    envelope: number[]
    part: number[]
    wave: Wave
  }
  const play = ({ type, envelope, part, wave }: Note, frames: number) =>
    runSound(
      host,
      {
        songs: [{ voices: [{ type, wave: WAVE, envelope }], tracks: [[VOICE, 0, ...part]] }],
        data: [...mixerInfo(), { at: WAVE, bytes: waveBytes(wave) }],
        mixer: true,
      },
      frames,
    )

  it('releases a channel after its gate until the level reaches 0, and frees it', () => {
    const part = [N(2), 60, 100, W(24), FINE]
    const wave = { size: 50_000, data: [] }
    const frames = play({ type: FIX, envelope: [255, 0, 255, 128], part, wave }, 11)
    const levels = [255, 255, 127, 63, 31, 15, 7, 3, 1, 0]
    expect(frames.slice(0, 10).map((frame) => frame.pcm[0]?.envelope)).toEqual(levels)
    expect(frames.slice(0, 10).map((frame) => frame.pcm[0]?.status)).toEqual([
      2,
      1,
      ...new Array<number>(7).fill(STOP | 1),
      0,
    ])
    expect(frames[9]?.tracks[0]?.[0]?.chan).toBe(pcmAt(0))
    expect(frames[10]?.tracks[0]?.[0]?.chan).toBe(0)
    expect(frames[10]?.pcm[0]?.track).toBe(0)
  })

  it('ends a cry when its compressed sample ends, though its note is a tie', () => {
    const wave: Wave = { compressed: true, size: 1000, data: [] }
    const part = [TIE, 60, 100, W(24), W(24), FINE]
    const frames = play({ type: CMP | FIX, envelope: [255, 0, 255, 0], part, wave }, 3)
    expect(frames.map((frame) => frame.pcm[0]?.status)).toEqual([2, 0, 0])
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.chan)).toEqual([pcmAt(0), pcmAt(0), 0])
    expect(frames[1]?.pcm[0]?.track).toBe(trackAt(0, 0))
  })
})
