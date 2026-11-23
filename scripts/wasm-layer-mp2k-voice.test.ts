// The sequencer of our platform layer (#43, plan B8a), run natively in the host harness: which
// voice a note plays, which channel it takes, the players' order and the stopping calls
// (MP2K spec sections 1, 4.1, 5.3-5.7).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  address,
  CMD,
  ID,
  N,
  pcmAt,
  playerAt,
  runSound,
  type Song,
  sound,
  trackAt,
  voice,
  W,
} from './wasm-layer-mp2k.ts'
import { asWords, load, read, runScript } from './wasm-layer-script.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-mp2k-voice-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const { BEND, FINE, PAN, PRIO, TIE, VOICE, VOL } = CMD
const START = 0x80
const PAUSE = 0x80000000
const GROUP = 0x02012000
const SPLIT = 0x02012800
const [WAVE_A, WAVE_B] = [0x02013000, 0x02014000]

/** The stand-ins' frequencies (host/irv_layer_host_mp2k.c). */
const pcmPitch = (wave: number, key: number, fine = 0) => ((wave << 16) | (key << 8) | fine) >>> 0
const psgPitch = (chan: number, key: number, fine = 0) => (chan << 16) | (key << 8) | fine
/** MP2K spec 5.4 on a track at VOL 127 and pan 0: volMR 127, volML 126. */
const volumes = (velocity: number, pan: number) => ({
  right: Math.min(255, (velocity * (128 + pan) * 127) >> 14),
  left: Math.min(255, (velocity * (127 - pan) * 126) >> 14),
})
const play = (song: Song, frames: number, data: { at: number; bytes: number[] }[] = []) =>
  runSound(host, { songs: [{ voices: [{ wave: WAVE_A }], ...song }], data }, frames)

describe('which voice a note plays (MP2K spec 5.3)', () => {
  it('a key split picks the sub voice by the key and keeps the key', () => {
    const split = { type: 0x40, wave: GROUP, envelope: address(SPLIT) }
    const group = [
      voice({ wave: WAVE_A, envelope: [1, 2, 3, 4] }),
      voice({ wave: WAVE_B, envelope: [5, 6, 7, 8] }),
    ]
    const table = Array.from({ length: 128 }, (_, key) => (key < 60 ? 0 : 1))
    const part = [VOICE, 0, N(1), 59, 100, W(1), N(1), 60, 100, W(1), FINE]
    const data = [
      { at: GROUP, bytes: group.flat() },
      { at: SPLIT, bytes: table },
    ]
    const frames = play({ voices: [split], tracks: [part] }, 2, data)
    expect(frames[1]?.pcm[0]).toMatchObject({
      wave: WAVE_A,
      attack: 1,
      release: 4,
      key: 59,
      midiKey: 59,
    })
    expect(frames[1]?.pcm[1]).toMatchObject({
      wave: WAVE_B,
      attack: 5,
      release: 8,
      key: 60,
      midiKey: 60,
    })
    expect(frames[1]?.pcm[1]?.frequency).toBe(pcmPitch(WAVE_B, 60))
  })

  it("a drum kit picks the sub voice by the key and plays the sub voice's key and pan", () => {
    const kit: Record<number, number[]> = {
      36: voice({ key: 48, panSweep: 0xc0 + 16, wave: WAVE_A, envelope: [9, 0, 0, 0] }),
      38: voice({ key: 50, panSweep: 0x40, wave: WAVE_B }),
      40: voice({ type: 0x40 }),
    }
    const group = Array.from({ length: 41 }, (_, key) => kit[key] ?? voice({})).flat()
    const part = [
      VOICE,
      0,
      VOL,
      127,
      N(1),
      36,
      100,
      W(1),
      N(1),
      38,
      100,
      W(1),
      N(1),
      40,
      100,
      W(1),
      FINE,
    ]
    const frames = play({ voices: [{ type: 0x80, wave: GROUP }], tracks: [part] }, 3, [
      { at: GROUP, bytes: group },
    ])
    expect(frames[0]?.pcm[0]).toMatchObject({
      key: 48,
      midiKey: 36,
      rhythmPan: 32,
      wave: WAVE_A,
      attack: 9,
    })
    expect(frames[0]?.pcm[0]).toMatchObject({
      ...volumes(100, 32),
      frequency: pcmPitch(WAVE_A, 48),
    })
    expect(frames[1]?.pcm[1]).toMatchObject({
      key: 50,
      midiKey: 38,
      rhythmPan: 0,
      ...volumes(100, 0),
    })
    expect(frames[2]?.pcm[2]?.status).toBe(0)
  })

  it('gives a note the priority of its player and track, at most 255', () => {
    const part = [VOICE, 0, PRIO, 7, N(1), 60, 100, W(1), FINE]
    expect(play({ priority: 5, tracks: [part] }, 1)[0]?.pcm[0]?.priority).toBe(12)
    expect(play({ priority: 250, tracks: [part] }, 1)[0]?.pcm[0]?.priority).toBe(255)
  })
})

describe('PSG voices (MP2K spec 4.4, 5.5, 5.6)', () => {
  it('take their own channel with the length, the pitch and the modify bits', () => {
    const part = [VOICE, 0, TIE, 60, 100, W(1), PAN, 0x50, W(1), BEND, 0x50, W(1), FINE]
    const frames = play({ voices: [{ type: 2, length: 5 }], tracks: [part] }, 3)
    expect(frames[0]?.psg[1]).toMatchObject({ status: START, length: 5, sweep: 8, modify: 0 })
    expect(frames[0]?.psg[1]).toMatchObject({ frequency: psgPitch(2, 60), track: trackAt(0, 0) })
    expect(frames.map((frame) => frame.psg[1]?.modify)).toEqual([0, 1, 3])
    expect(frames[2]?.psg[1]?.frequency).toBe(psgPitch(2, 60, 128))
    expect(frames[0]?.pcm[0]?.status).toBe(0)
  })

  it("take channel 1's sweep only when it is set and bit 7 is clear", () => {
    const voices = [0x15, 0x85, 0x05].map((panSweep) => ({ type: 1, panSweep }))
    const part = [
      VOICE,
      0,
      N(1),
      60,
      100,
      W(1),
      VOICE,
      1,
      N(1),
      60,
      100,
      W(1),
      VOICE,
      2,
      N(1),
      60,
      100,
      W(1),
      FINE,
    ]
    const frames = play({ voices, tracks: [part] }, 3)
    expect(frames.map((frame) => frame.psg[0]?.sweep)).toEqual([0x15, 8, 8])
  })
})

describe('choosing a channel (MP2K spec 5.5)', () => {
  const holders = (count: number, gate: number = TIE) =>
    Array.from({ length: count }, (_, i) => [
      VOICE,
      0,
      PRIO,
      10,
      i === 2 ? gate : TIE,
      60 + i,
      100,
      W(24),
      FINE,
    ])
  const stealer = (priority: number) => [W(1), VOICE, 0, PRIO, priority, TIE, 70, 100, W(24), FINE]
  const keysAfter = (tracks: number[][]) => play({ tracks }, 2)[1]?.pcm.map((chan) => chan.midiKey)

  it('drops a DirectSound note when every channel plays at its priority for an earlier track', () => {
    expect(keysAfter([...holders(5), stealer(10)])).toEqual([60, 61, 62, 63, 64])
  })

  it('steals from the lowest priority, the later track on a tie', () => {
    const frames = play({ tracks: [...holders(5), stealer(20)] }, 2)
    expect(frames[1]?.pcm.map((chan) => chan.midiKey)).toEqual([60, 61, 62, 63, 70])
    expect(frames[1]?.pcm[4]?.track).toBe(trackAt(0, 5))
    expect(frames[1]?.tracks[0]?.[4]?.chan).toBe(0)
    expect(frames[1]?.tracks[0]?.[5]?.chan).toBe(pcmAt(4))
  })

  it('prefers a releasing channel whatever its priority, and an off channel above all', () => {
    expect(keysAfter([...holders(5, N(1)), stealer(5)])).toEqual([60, 61, 70, 63, 64])
    expect(keysAfter([...holders(4), stealer(0)])).toEqual([60, 61, 62, 63, 70])
  })

  it('takes a PSG channel when it is releasing or below the priority, else drops the note', () => {
    const first = (gate: number) => [VOICE, 0, PRIO, 5, gate, 60, 100, W(24), FINE]
    const second = (priority: number) => [W(1), VOICE, 0, PRIO, priority, TIE, 62, 100, W(24), FINE]
    const key = (tracks: number[][]) =>
      play({ voices: [{ type: 2 }], tracks }, 2)[1]?.psg[1]?.midiKey
    expect([5, 6, 4].map((priority) => key([first(TIE), second(priority)]))).toEqual([60, 62, 60])
    expect(key([first(N(1)), second(0)])).toBe(62)
  })
})

describe('the players (MP2K spec 1, R2, and 4.1)', () => {
  const song = (key: number): Song => ({
    voices: [{ wave: WAVE_A }],
    tracks: [[VOICE, 0, N(1), key, 100, W(1), FINE]],
  })

  it('run in the order they were opened', () => {
    const frames = runSound(host, { songs: [song(60), song(61)] }, 1)
    expect(frames[0]?.pcm.slice(0, 2)).toMatchObject([
      { midiKey: 60, track: trackAt(0, 0) },
      { midiKey: 61, track: trackAt(1, 0) },
    ])
  })

  it('skip a frame while locked or paused', () => {
    const lock = { 0: [load(playerAt(0) + 0x34, address(ID + 1))] }
    const locked = runSound(host, { songs: [song(60), song(61)], before: lock }, 1)[0]
    expect(locked?.players.map((player) => [player.clock, player.ident])).toEqual([
      [0, ID + 1],
      [1, ID],
    ])
    const pause = { 0: [load(playerAt(0) + 4, address(PAUSE))] }
    expect(runSound(host, { songs: [song(60)], before: pause }, 1)[0]?.players[0]?.clock).toBe(0)
  })
})

describe('stopping (MP2K spec 5.7)', () => {
  it("TrackStop silences the track's channels at once and turns its PSG channels off", () => {
    const part = [VOICE, 0, TIE, 60, 100, W(1), VOICE, 1, TIE, 62, 100, W(24), FINE]
    const stop = { 2: [sound(2, playerAt(0), trackAt(0, 0))] }
    const voices = [{ wave: WAVE_A }, { type: 1 }]
    const frames = runSound(host, { songs: [{ voices, tracks: [part] }], before: stop }, 3)
    expect([frames[1]?.pcm[0]?.status, frames[1]?.psg[0]?.status]).toEqual([START, START])
    expect(frames[2]?.pcm[0]).toMatchObject({ status: 0, track: 0 })
    expect(frames[2]?.psg[0]).toMatchObject({ status: 0, track: 0 })
    expect(frames[2]?.tracks[0]?.[0]).toMatchObject({ chan: 0, flags: 0x80 })
    expect(frames[2]?.oscOff).toEqual([1])
  })

  it('RealClearChain unlinks a channel and leaves its own links', () => {
    const part = [VOICE, 0, TIE, 60, 100, W(1), TIE, 61, 100, W(1), TIE, 62, 100, W(24), FINE]
    const before = { 3: [sound(3, pcmAt(1))], 4: [sound(3, pcmAt(2))] }
    const frames = runSound(
      host,
      { songs: [{ voices: [{ wave: WAVE_A }], tracks: [part] }], before },
      5,
    )
    const links = (i: number) =>
      frames[i]?.pcm.slice(0, 3).map(({ prev, next, track }) => [prev, next, track])
    const track = trackAt(0, 0)
    expect(links(2)).toEqual([
      [pcmAt(1), 0, track],
      [pcmAt(2), pcmAt(0), track],
      [0, pcmAt(1), track],
    ])
    expect(links(3)).toEqual([
      [pcmAt(2), 0, track],
      [pcmAt(2), pcmAt(0), 0],
      [0, pcmAt(0), track],
    ])
    expect(frames[4]?.tracks[0]?.[0]?.chan).toBe(pcmAt(0))
    expect(links(4)?.[0]).toEqual([0, 0, track])
  })
})

describe('the helpers the game calls (MP2K spec 1)', () => {
  it('umul3232H32 gives the high 32 bits of the product', () => {
    const ops = [
      sound(4, 0xffffffff, 0xffffffff),
      sound(4, 0x80000000, 6),
      sound(4, 0x12345678, 1 << 22),
    ]
    expect(asWords(runScript(host, ops, 12).dest)).toEqual([0xfffffffe, 3, 0x48d15])
  })

  it("MPlayJumpTableCopy copies the template's 36 entries", () => {
    const table = 0x02020000
    const ops = [load(table + 36 * 4, address(0xaaaaaaaa)), sound(1, table), read(table, 37 * 4)]
    const words = asWords(runScript(host, ops, 37 * 4).dest)
    expect(words[36]).toBe(0xaaaaaaaa)
    expect([5, 6, 7, 8, 21, 22, 24, 25, 26, 28].map((i) => words[i])).toEqual(
      new Array<number>(10).fill(words[0] as number),
    )
    expect(new Set(words.slice(0, 30)).size).toBe(30 - 10)
  })
})
