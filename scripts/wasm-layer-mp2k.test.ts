// The sequencer of our platform layer (#43, plan B8a), run natively in the host harness: songs in
// host memory, MPlayMain once per frame, the engine read back (MP2K spec sections 2.6, 3 and 4).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  address,
  CMD,
  type Frame,
  N,
  partAt,
  pcmAt,
  runSound,
  type Scene,
  trackAt,
  W,
  X,
} from './wasm-layer-mp2k.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-mp2k-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const { BEND, BENDR, EOT, FINE, GOTO, KEYSH, LFODL, MOD, MODT, PAN, PATT, PEND, PORT } = CMD
const { REPT, TEMPO, TIE, TUNE, VOICE, VOL, XCMD } = CMD
const PAUSE = 0x80000000
const START = 0x80
const STOP = 0x40
const WAVE = 0x02011000
const PATTERN = 0x02010000

/** Each track starts with VOICE 0, as the game's songs do: a starting track plays PSG voice 1. */
const play = (tracks: number[][], frames: number, scene: Partial<Scene> = {}) =>
  runSound(
    host,
    {
      songs: [{ voices: [{ wave: WAVE }], tracks: tracks.map((part) => [VOICE, 0, ...part]) }],
      ...scene,
    },
    frames,
  )
/** Where a track's own bytes start, after its VOICE 0. */
const body = (track: number) => partAt(0, track) + 2
const keys = (frame: Frame) => frame.pcm.map((chan) => chan.midiKey)
/** The stand-in MidiKeyToFreq's value for the voice's sample (host/irv_layer_host_mp2k.c). */
const pitch = (key: number, fine = 0) => ((WAVE << 16) | (key << 8) | fine) >>> 0

describe('MPlayMain: notes, ticks and the tempo (MP2K spec 4.2, 4.3, 5.1, 5.2)', () => {
  it('plays the first note of a two-note song at tick 0 and stops it after its gate', () => {
    const part = [VOL, 100, N(4), 60, 100, W(6), N(2), 62, 90, W(2), FINE]
    const frames = play([part], 10)
    expect(frames[0]?.pcm[0]).toMatchObject({ status: START, midiKey: 60, key: 60, velocity: 100 })
    expect(frames[0]?.pcm[0]).toMatchObject({ gate: 4, track: trackAt(0, 0) })
    expect(frames.map((frame) => frame.pcm[0]?.status)).toEqual([
      START,
      START,
      START,
      START,
      START | STOP,
      START | STOP,
      START | STOP,
      0xc0,
      0xc0,
      0xc0,
    ])
    expect(frames[6]?.pcm[1]).toMatchObject({ status: START, midiKey: 62, velocity: 90, gate: 2 })
    expect(frames[7]?.pcm[1]?.status).toBe(START)
    expect(frames[8]?.pcm[1]?.status).toBe(START | STOP)
  })

  it('ends the track at FINE, releases and unlinks its channels, and stops the player a tick later', () => {
    const frames = play([[N(4), 60, 100, W(2), FINE]], 4)
    expect(frames[1]?.tracks[0]?.[0]?.chan).toBe(pcmAt(0))
    expect(frames[2]?.tracks[0]?.[0]).toMatchObject({ flags: 0, chan: 0 })
    expect(frames[2]?.pcm[0]).toMatchObject({ status: START | STOP, track: 0 })
    expect(frames.map((frame) => frame.players[0]?.status)).toEqual([1, 1, 1, PAUSE])
    expect(frames.map((frame) => frame.players[0]?.clock)).toEqual([1, 2, 3, 4])
  })

  it('ticks once per frame at the start tempo', () => {
    const frames = play([[W(24), W(24), FINE]], 3)
    expect(frames.map((frame) => frame.players[0]?.clock)).toEqual([1, 2, 3])
  })

  it('ply_tempo changes the ticks per frame from the next frame on', () => {
    const fast = play([[TEMPO, 150, W(24), W(24), FINE]], 3)
    expect(fast.map((frame) => frame.players[0]?.clock)).toEqual([1, 3, 5])
    expect(fast[0]?.players[0]).toMatchObject({ tempoD: 300, tempoI: 300 })
    const slow = play([[TEMPO, 50, W(24), W(24), FINE]], 7)
    expect(slow.map((frame) => frame.players[0]?.clock)).toEqual([1, 1, 2, 3, 3, 4, 5])
    expect(slow.map((frame) => frame.players[0]?.tempoC)).toEqual([0, 100, 50, 0, 100, 50, 0])
  })

  it('ply_rept plays its passage twice for a count of 2', () => {
    const part = [N(1), 60, 100, W(2), REPT, 2, ...address(body(0)), FINE]
    const frames = play([part], 6)
    expect(keys(frames[2] as Frame)).toEqual([60, 60, 0, 0, 0])
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.repN)).toEqual([0, 0, 1, 1, 0, 0])
    expect(frames.map((frame) => frame.players[0]?.status)).toEqual([1, 1, 1, 1, 1, PAUSE])
  })

  it('ply_rept loops for ever on a count of 0', () => {
    const frames = play([[W(1), REPT, 0, ...address(body(0))]], 8)
    expect(frames.every((frame) => frame.players[0]?.status === 1)).toBe(true)
    expect(frames[7]?.tracks[0]?.[0]?.cmdPtr).toBe(body(0) + 1)
  })
})

describe('the command bytes (MP2K spec 2.6, 5.1)', () => {
  it('repeats the running status for a byte below 0x80, a note with its own arguments', () => {
    const part = [N(4), 60, 100, W(1), 62, 90, W(1), 64, W(1), VOL, 100, W(1), 80, W(1), FINE]
    const frames = play([part], 5)
    expect(frames[2]?.pcm.slice(0, 3)).toMatchObject([
      { midiKey: 60, velocity: 100 },
      { midiKey: 62, velocity: 90 },
      { midiKey: 64, velocity: 90, gate: 4 },
    ])
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.vol)).toEqual([0, 0, 0, 100, 80])
  })

  it('adds a third argument byte to the gate', () => {
    const frames = play([[N(4), 60, 100, 3, W(24), FINE]], 1)
    expect(frames[0]?.pcm[0]?.gate).toBe(7)
  })

  it('plays a pattern and returns after it; PEND at level 0 does nothing', () => {
    const main = [PATT, ...address(PATTERN), PATT, ...address(PATTERN), PEND, N(1), 67, 100]
    const data = [{ at: PATTERN, bytes: [N(1), 64, 100, W(1), PEND] }]
    const frames = play([[...main, W(1), FINE]], 3, { data })
    expect(keys(frames[2] as Frame)).toEqual([64, 64, 67, 0, 0])
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.patternLevel)).toEqual([1, 1, 0])
  })

  it('ends the track at a fourth PATT level', () => {
    const data = [{ at: PATTERN, bytes: [PATT, ...address(PATTERN)] }]
    const frames = play([[PATT, ...address(PATTERN)]], 2, { data })
    expect(frames[0]?.tracks[0]?.[0]).toMatchObject({ flags: 0, patternLevel: 3 })
    expect(frames[1]?.players[0]?.status).toBe(PAUSE)
  })

  it('jumps with GOTO', () => {
    const frames = play([[N(1), 60, 100, W(1), GOTO, ...address(body(0))]], 4)
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.cmdPtr)).toEqual(
      new Array<number>(4).fill(body(0) + 4),
    )
    expect(frames[3]?.players[0]?.status).toBe(1)
  })

  it('takes VOL, PAN, KEYSH, BEND, BENDR and TUNE into the track', () => {
    const part = [VOL, 90, PAN, 0x50, KEYSH, 0xfe, BENDR, 12, BEND, 0x30, TUNE, 0x48, W(1), FINE]
    const track = play([part], 1)[0]?.tracks[0]?.[0]
    expect(track).toMatchObject({ vol: 90, pan: 16, keyShift: -2, bendRange: 12, bend: -16 })
    expect(track?.tune).toBe(8)
  })

  it('writes PORT into the sound registers', () => {
    const probe = { at: 0x04000080, length: 4 }
    const frames = play([[PORT, 0x20, 0x77, PORT, 0x21, 0x12, W(1), FINE]], 1, { probe })
    expect(frames[0]?.probe).toEqual([0x77, 0x12, 0, 0])
  })

  it('resets a starting track: bend range 2, volX 64, LFO speed 22, a voice of type 1', () => {
    const track = runSound(host, { songs: [{ tracks: [[W(1), FINE]] }] }, 1)[0]?.tracks[0]?.[0]
    expect(track).toMatchObject({ flags: 0x80, bendRange: 2, volX: 64, lfoSpeed: 22, toneType: 1 })
  })
})

describe('volume and pitch on the playing channels (MP2K spec 4.4)', () => {
  it('passes a pan change to the channels in the same frame', () => {
    const frames = play([[VOL, 127, TIE, 60, 127, W(1), PAN, 0x40 + 32, W(1), FINE]], 2)
    // TrkVolPitSet: x = 127 * 64 >> 5 = 254; MP2K spec 5.4 with the velocity 127.
    expect(frames[0]?.pcm[0]).toMatchObject({
      right: (127 * 128 * 127) >> 14,
      left: (127 * 127 * 126) >> 14,
    })
    const [right, left] = [(192 * 254) >> 8, (63 * 254) >> 8]
    expect(frames[1]?.pcm[0]).toMatchObject({
      right: (127 * 128 * right) >> 14,
      left: (127 * 127 * left) >> 14,
    })
  })

  it('bends the pitch by the bend range in semitones', () => {
    const frames = play(
      [[TIE, 60, 100, W(1), BENDR, 12, BEND, 0x60, W(1), KEYSH, 0x100 - 70, W(1), FINE]],
      3,
    )
    expect(frames.map((frame) => frame.pcm[0]?.frequency)).toEqual([pitch(60), pitch(66), pitch(0)])
  })

  it('runs the LFO after its delay and passes it to the pitch', () => {
    const part = [LFODL, 2, MOD, 64, TIE, 60, 100, W(24), FINE]
    const frames = play([part], 15)
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.modM)).toEqual([
      0, 0, 22, 44, 62, 40, 18, -4, -26, -48, -58, -36, -14, 8, 30,
    ])
    expect(frames[2]?.pcm[0]?.frequency).toBe(pitch(61, 0x60))
    expect(frames[7]?.pcm[0]?.frequency).toBe(pitch(59, 0xc0))
  })

  it('MOD 0 clears the LFO; MODT sends it to the volume', () => {
    const frames = play([[MOD, 64, W(3), MOD, 0, MODT, 1, W(1), FINE]], 4)
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.modM)).toEqual([22, 44, 62, 0])
    expect(frames[3]?.tracks[0]?.[0]).toMatchObject({ lfoSpeedC: 0, modT: 1 })
  })
})

describe('ties and the cry path (MP2K spec 3, 5.2, 11)', () => {
  it('holds a tie until EOT, which stops one channel of its key', () => {
    const part = [TIE, 60, 100, W(1), TIE, 60, 100, W(1), TIE, 62, 100, W(1), EOT, 60, W(1), EOT]
    const frames = play([[...part, 62, W(1), EOT, W(1), FINE]], 6)
    expect(frames[2]?.pcm.slice(0, 3).map((chan) => chan.status)).toEqual([START, START, START])
    expect(frames[3]?.pcm.slice(0, 3).map((chan) => chan.status)).toEqual([
      START,
      START | STOP,
      START,
    ])
    expect(frames[4]?.pcm.slice(0, 3).map((chan) => chan.status)).toEqual([
      START,
      START | STOP,
      START | STOP,
    ])
    expect(frames[5]?.pcm[0]?.status).toBe(START)
    expect(frames[5]?.pcm[0]?.gate).toBe(0)
  })

  it("plays the game's cry song: chorus TUNE, start offset, xRELE, then xWAIT, EOT and FINE", () => {
    const cont = [VOICE, 0, VOL, 127, XCMD, X.START, ...address(0x1234), XCMD, X.RELE, 200]
    const tie = [PAN, 0x40, TIE, 60, 127, XCMD, X.WAIT, 3, 0, EOT, FINE]
    const part0 = [TUNE, 0x40, GOTO, ...address(body(1) + 2)]
    const frames = play([part0, [TUNE, 0x50, ...cont, ...tie]], 5)
    const [first, , third, fourth] = frames as [Frame, Frame, Frame, Frame]
    expect(first.pcm.slice(0, 2)).toMatchObject([
      { count: 0x1234, release: 200, gate: 0, frequency: pitch(60) },
      { count: 0x1234, release: 200, gate: 0, frequency: pitch(60, 64) },
    ])
    expect(frames.map((frame) => frame.tracks[0]?.[0]?.timer)).toEqual([1, 2, 3, 0, 0])
    expect(third.tracks[0]).toMatchObject([{ chan: pcmAt(0) }, {}])
    expect(third.pcm[0]).toMatchObject({ track: trackAt(0, 0) })
    expect(fourth.tracks[0]).toMatchObject([{ flags: 0, chan: 0 }, {}])
    expect(fourth.pcm.slice(0, 2).map((chan) => chan.status)).toEqual([START | STOP, START | STOP])
    expect(frames.map((frame) => frame.players[0]?.status)).toEqual([3, 3, 3, 3, PAUSE])
  })
})

describe("the spec side's answers (MP2K spec 12.2, 12.3)", () => {
  const MAX_CHANS = 0x03000006
  const raw = (tracks: number[][], frames: number, scene: Partial<Scene> = {}) =>
    runSound(host, { songs: [{ voices: [{ wave: WAVE }], tracks }], ...scene }, frames)
  const holder = (key: number) => [VOICE, 0, TIE, key, 100, W(24), FINE]
  const late = [W(1), VOICE, 0, TIE, 70, 100, W(24), FINE]

  it('ends a track whose first byte is data with no running status, and stops the player a tick later', () => {
    const frames = raw([[0x3c, N(4), 60, 100, FINE]], 2)
    expect(frames[0]?.tracks[0]?.[0]?.flags).toBe(0)
    expect(frames[0]?.pcm[0]?.status).toBe(0)
    expect(frames.map((frame) => frame.players[0]?.status)).toEqual([1, PAUSE])
  })

  it('leaves tempoC unreduced on the tick that stops the player', () => {
    const frames = raw([[FINE]], 2)
    expect(frames.map((frame) => frame.players[0]?.tempoC)).toEqual([0, 150])
    expect(frames.map((frame) => frame.players[0]?.status)).toEqual([1, PAUSE])
  })

  it('scans maxChans DirectSound channels for a note, not the 12 of the array', () => {
    const data = [{ at: MAX_CHANS, bytes: [3] }]
    const frames = raw([holder(60), holder(61), holder(62), late], 2, { data })
    expect(keys(frames[1] as Frame)).toEqual([60, 61, 62, 0, 0])
  })

  it('scans at least one channel when maxChans is 0', () => {
    const frames = raw([holder(60)], 1, { data: [{ at: MAX_CHANS, bytes: [0] }] })
    expect(keys(frames[0] as Frame)).toEqual([60, 0, 0, 0, 0])
  })
})
