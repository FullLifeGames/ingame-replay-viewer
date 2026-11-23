// The sound side of wasm:run's report (#43, B8b, O7): each frame's level and the song of the BGM
// player, read from a module's memory as the engine lays it out (MP2K spec 2.3, 4.1).
import { describe, expect, it } from 'vitest'

import { bgmSong, SoundLog } from './wasm-run-sound.ts'

const MEMORY = 0x03010000
const INFO = 0x03000000
const PLAYERS = [0x03001000, 0x03001040, 0x03001080]
const SONG = 0x02000100

function memoryWith(head: number | undefined, song = SONG): Uint8Array {
  const memory = new Uint8Array(MEMORY)
  const view = new DataView(memory.buffer)
  view.setUint32(0x03007ff0, head === undefined ? 0 : INFO, true)
  if (head === undefined) return memory
  view.setUint32(INFO + 0x24, head, true)
  // The chain from the head: cry, then SE, then BGM, the first player opened.
  view.setUint32(PLAYERS[2] as number, song, true)
  view.setUint32((PLAYERS[0] as number) + 0x3c, PLAYERS[1] as number, true)
  view.setUint32((PLAYERS[1] as number) + 0x3c, PLAYERS[2] as number, true)
  memory[song] = 9
  return memory
}

describe('bgmSong', () => {
  it('follows the player chain to its last player and reads its song header', () => {
    expect(bgmSong(memoryWith(PLAYERS[0]))).toEqual({ header: SONG, tracks: 9 })
  })

  it('gives nothing before m4aSoundInit and for a memory too small to hold the engine', () => {
    expect(bgmSong(memoryWith(undefined))).toBeUndefined()
    expect(bgmSong(new Uint8Array(1024))).toBeUndefined()
  })

  it('gives 0 tracks while the player has no song', () => {
    expect(bgmSong(memoryWith(PLAYERS[0], 0))).toEqual({ header: 0, tracks: 0 })
  })
})

describe('SoundLog', () => {
  it('keeps one level per frame and the frames where the BGM song changes', () => {
    const log = new SoundLog()
    const memory = memoryWith(PLAYERS[0])
    for (let frame = 1; frame <= 120; frame++) {
      log.add(new Float32Array(1408).fill(frame <= 60 ? 0.5 : 0))
      if (frame === 90)
        new DataView(memory.buffer).setUint32(PLAYERS[2] as number, 0x02000200, true)
      log.frame(frame, memory)
    }
    expect(log.seconds(1, 120)).toEqual([0.5, 0])
    expect(log.songs).toEqual([
      { frame: 1, header: SONG, tracks: 9 },
      { frame: 90, header: 0x02000200, tracks: 0 },
    ])
  })

  it('cuts the seconds at the last frame it has', () => {
    const log = new SoundLog()
    for (let frame = 1; frame <= 30; frame++) {
      log.add(new Float32Array([0.25, -0.25]))
      log.frame(frame, new Uint8Array(16))
    }
    expect(log.seconds(1, 600)).toEqual([0.25])
    expect(log.songs).toEqual([])
  })
})
