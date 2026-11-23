// The sound side of wasm:run's report (#43, B8b, open point O7 of the MP2K spec): the level of
// each frame's samples, and the song the BGM player plays, read from the module's memory through
// the engine's SoundInfo pointer. The BGM player is opened first, so it is the last player of the
// chain from musicPlayerHead (MP2K spec 2.3, 4.1).
const SOUND_INFO_POINTER = 0x03007ff0
const MUSIC_PLAYER_HEAD = 0x24
const PLAYER_NEXT = 0x3c
const MAX_PLAYERS = 8
const FRAMES_PER_SECOND = 60

export interface BgmSong {
  /** The address of the song header, 0 while the player has no song. */
  header: number
  /** The header's track count (MP2K spec 2.1). */
  tracks: number
}

function word(memory: Uint8Array, at: number): number | undefined {
  if (at <= 0 || at + 4 > memory.length) return undefined
  return new DataView(memory.buffer, memory.byteOffset).getUint32(at, true)
}

export function bgmSong(memory: Uint8Array): BgmSong | undefined {
  const info = word(memory, SOUND_INFO_POINTER)
  let player = info === undefined ? undefined : word(memory, info + MUSIC_PLAYER_HEAD)
  for (let i = 0; i < MAX_PLAYERS && player !== undefined && player !== 0; i++) {
    const next = word(memory, player + PLAYER_NEXT)
    if (next === 0) {
      const header = word(memory, player) ?? 0
      return { header, tracks: header === 0 ? 0 : (memory[header] ?? 0) }
    }
    player = next
  }
  return undefined
}

export class SoundLog {
  /** The frames on which the BGM player's song header differed from the frame before. */
  readonly songs: (BgmSong & { frame: number })[] = []
  private readonly levels: number[] = []
  private squares = 0
  private samples = 0

  add(samples: Float32Array): void {
    for (const sample of samples) this.squares += sample * sample
    this.samples += samples.length
  }

  /** Closes frame `frame` (counted from 1): its level, and the BGM song in `memory`. */
  frame(frame: number, memory: Uint8Array): void {
    this.levels[frame - 1] = this.samples === 0 ? 0 : Math.sqrt(this.squares / this.samples)
    this.squares = 0
    this.samples = 0
    const song = bgmSong(memory)
    const last = this.songs.at(-1)
    if (song !== undefined && song.header !== last?.header) this.songs.push({ frame, ...song })
  }

  /** The RMS level of each second (60 frames) from frame `from` to frame `to`. */
  seconds(from: number, to: number): number[] {
    const levels = this.levels.slice(from - 1, to)
    const seconds: number[] = []
    for (let at = 0; at < levels.length; at += FRAMES_PER_SECOND) {
      const second = levels.slice(at, at + FRAMES_PER_SECOND)
      const squares = second.reduce((sum, level) => sum + level * level, 0)
      seconds.push(Math.sqrt(squares / second.length))
    }
    return seconds
  }
}
