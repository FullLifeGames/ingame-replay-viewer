// The sequencer of our platform layer (#43, B8a) as the specs drive it through the harness's
// `script` command: a sound engine laid out in host memory as the game's m4aSoundInit and
// MPlayStart leave it, its frames run, and its channels, players and tracks read back after each
// frame. Offsets and command bytes are the MP2K spec's (sections 2.1-2.3 and 2.6).
import { load, type Op, read, runScript, wordBytes } from './wasm-layer-script.ts'

export const ID = 0x68736d53
export const SOUND_INFO_POINTER = 0x03007ff0
export const SOUND_INFO = 0x03000000
const CHANS = SOUND_INFO + 0x50
const CGB_CHANS = 0x03001000
const JUMP_TABLE = 0x03001200
const PLAYERS = 0x03002000
const TRACKS = 0x03003000
const TRACK_SLOTS = 16
/** The stand-in CgbOscOff's log (layer/host/irv_layer_host_mp2k.c): a count, then each channel. */
const HOST_LOG = 0x0203f000
const LOG_BYTES = 64
const PCM_CHANNELS = 5
const CHANNEL = 0x40
const TRACK = 0x50
const PLAYER = 0x40

/** The harness's numbers for the functions whose addresses the engine stores. */
const FN = { MPlayMain: 1, plyNote: 2, cgbOscOff: 3, midiKeyToCgbFreq: 4, xcmd: 5 }

export const CMD = {
  FINE: 0xb1,
  GOTO: 0xb2,
  PATT: 0xb3,
  PEND: 0xb4,
  REPT: 0xb5,
  PRIO: 0xba,
  TEMPO: 0xbb,
  KEYSH: 0xbc,
  VOICE: 0xbd,
  VOL: 0xbe,
  PAN: 0xbf,
  BEND: 0xc0,
  BENDR: 0xc1,
  LFOS: 0xc2,
  LFODL: 0xc3,
  MOD: 0xc4,
  MODT: 0xc5,
  TUNE: 0xc8,
  PORT: 0xcc,
  XCMD: 0xcd,
  EOT: 0xce,
  TIE: 0xcf,
} as const
/** The XCMD sub-commands of the game's gXcmdTable that the stand-in ply_xcmd serves. */
export const X = { RELE: 0x07, IECV: 0x08, IECL: 0x09, WAIT: 0x0c, START: 0x0d } as const
/** `W`n and `N`n for n up to 24 ticks, where gClockTable[n] is n. */
export const W = (ticks: number) => 0x80 + ticks
export const N = (ticks: number) => 0xcf + ticks
export const address = (value: number) => wordBytes([value])

const songAt = (player: number) => 0x02000000 + player * 0x4000
const voicesAt = (player: number) => songAt(player) + 0x100
export const partAt = (player: number, track: number) => songAt(player) + 0x1000 + track * 0x400
export const trackAt = (player: number, track: number) =>
  TRACKS + player * TRACK_SLOTS * TRACK + track * TRACK
export const playerAt = (player: number) => PLAYERS + player * PLAYER
export const pcmAt = (channel: number) => CHANS + channel * CHANNEL

/** A 12-byte voice (MP2K spec 2.2). */
export interface Voice {
  type?: number
  key?: number
  length?: number
  panSweep?: number
  wave?: number
  envelope?: readonly number[]
}
export function voice({ type = 0, key = 60, length = 0, panSweep = 0, wave = 0, envelope }: Voice) {
  return [type, key, length, panSweep, ...address(wave), ...(envelope ?? [255, 0, 255, 0])]
}

export interface Song {
  priority?: number
  voices?: readonly Voice[]
  tracks: readonly (readonly number[])[]
}

export interface Scene {
  songs: readonly Song[]
  /** Bytes anywhere in the address space: sub voice groups, key-split tables. */
  data?: readonly { at: number; bytes: readonly number[] }[]
  /** Operations before the given frame's players run. */
  before?: Readonly<Record<number, readonly Op[]>>
  /** Bytes read back after each frame besides the engine's. */
  probe?: { at: number; length: number }
  /** Each frame runs m4aSoundVSync and SoundMain (calls 6 and 5) instead of the players alone. */
  mixer?: boolean
}

type Kind = 'u8' | 's8' | 'u16' | 'u32'
type Fields = Record<string, readonly [number, Kind]>

const CHANNEL_FIELDS = {
  status: [0x00, 'u8'],
  type: [0x01, 'u8'],
  right: [0x02, 'u8'],
  left: [0x03, 'u8'],
  attack: [0x04, 'u8'],
  release: [0x07, 'u8'],
  key: [0x08, 'u8'],
  envelope: [0x09, 'u8'],
  echoVolume: [0x0c, 'u8'],
  echoLength: [0x0d, 'u8'],
  gate: [0x10, 'u8'],
  midiKey: [0x11, 'u8'],
  velocity: [0x12, 'u8'],
  priority: [0x13, 'u8'],
  rhythmPan: [0x14, 's8'],
  count: [0x18, 'u32'],
  modify: [0x1d, 'u8'],
  length: [0x1e, 'u8'],
  sweep: [0x1f, 'u8'],
  frequency: [0x20, 'u32'],
  wave: [0x24, 'u32'],
  track: [0x2c, 'u32'],
  prev: [0x30, 'u32'],
  next: [0x34, 'u32'],
} as const satisfies Fields
const TRACK_FIELDS = {
  flags: [0x00, 'u8'],
  wait: [0x01, 'u8'],
  patternLevel: [0x02, 'u8'],
  repN: [0x03, 'u8'],
  key: [0x05, 'u8'],
  velocity: [0x06, 'u8'],
  keyM: [0x08, 's8'],
  pitM: [0x09, 'u8'],
  keyShift: [0x0a, 's8'],
  tune: [0x0c, 's8'],
  bend: [0x0e, 's8'],
  bendRange: [0x0f, 'u8'],
  volMR: [0x10, 'u8'],
  volML: [0x11, 'u8'],
  vol: [0x12, 'u8'],
  volX: [0x13, 'u8'],
  pan: [0x14, 's8'],
  modM: [0x16, 's8'],
  modT: [0x18, 'u8'],
  lfoSpeed: [0x19, 'u8'],
  lfoSpeedC: [0x1a, 'u8'],
  lfoDelayC: [0x1c, 'u8'],
  priority: [0x1d, 'u8'],
  chan: [0x20, 'u32'],
  toneType: [0x24, 'u8'],
  release: [0x2f, 'u8'],
  timer: [0x3a, 'u16'],
  startOffset: [0x3c, 'u32'],
  cmdPtr: [0x40, 'u32'],
} as const satisfies Fields
const PLAYER_FIELDS = {
  status: [0x04, 'u32'],
  cmd: [0x0a, 'u8'],
  clock: [0x0c, 'u32'],
  tempoD: [0x1c, 'u16'],
  tempoI: [0x20, 'u16'],
  tempoC: [0x22, 'u16'],
  ident: [0x34, 'u32'],
} as const satisfies Fields

type Parsed<F extends Fields> = Record<keyof F, number>
type Channel = Parsed<typeof CHANNEL_FIELDS>
type Track = Parsed<typeof TRACK_FIELDS>
type Player = Parsed<typeof PLAYER_FIELDS>

function parse<F extends Fields>(bytes: Uint8Array, at: number, fields: F): Parsed<F> {
  const view = new DataView(bytes.buffer, bytes.byteOffset + at)
  const get: Record<Kind, (offset: number) => number> = {
    u8: (offset) => view.getUint8(offset),
    s8: (offset) => view.getInt8(offset),
    u16: (offset) => view.getUint16(offset, true),
    u32: (offset) => view.getUint32(offset, true),
  }
  const entries = Object.entries(fields).map(([name, [offset, kind]]) => [name, get[kind](offset)])
  return Object.fromEntries(entries) as Parsed<F>
}

const list = <F extends Fields>(bytes: Uint8Array, count: number, size: number, fields: F) =>
  Array.from({ length: count }, (_, i) => parse(bytes, i * size, fields))

export interface Frame {
  pcm: Channel[]
  psg: Channel[]
  players: Player[]
  tracks: Track[][]
  /** The channel numbers the engine passed to CgbOscOff so far. */
  oscOff: number[]
  probe: number[]
}

function soundInfo(players: number): number[] {
  const bytes = new Uint8Array(0x50)
  const view = new DataView(bytes.buffer)
  const words: [number, number][] = [
    [0x00, ID],
    [0x1c, CGB_CHANS],
    [0x20, FN.MPlayMain],
    [0x24, playerAt(players - 1)],
    [0x2c, FN.cgbOscOff],
    [0x30, FN.midiKeyToCgbFreq],
    [0x34, JUMP_TABLE],
    [0x38, FN.plyNote],
  ]
  for (const [at, value] of words) view.setUint32(at, value, true)
  bytes[6] = PCM_CHANNELS
  bytes[7] = 12
  return Array.from(bytes)
}

/** The song's header, voices and parts, and the player and tracks as MPlayStart leaves them. */
function songOps(song: Song, p: number): Op[] {
  const count = song.tracks.length
  const parts = song.tracks.map((_, i) => partAt(p, i))
  const header = [count, 0, song.priority ?? 0, 0, ...address(voicesAt(p)), ...wordBytes(parts)]
  const player = new DataView(new ArrayBuffer(PLAYER))
  const words: [number, number][] = [
    [0x00, songAt(p)],
    [0x2c, trackAt(p, 0)],
    [0x30, voicesAt(p)],
    [0x34, ID],
    [0x38, p > 0 ? FN.MPlayMain : 0],
    [0x3c, p > 0 ? playerAt(p - 1) : 0],
  ]
  for (const [at, value] of words) player.setUint32(at, value, true)
  player.setUint8(0x08, count)
  player.setUint8(0x09, song.priority ?? 0)
  for (const [at, value] of [
    [0x1c, 150],
    [0x1e, 0x100],
    [0x20, 150],
  ] as const) {
    player.setUint16(at, value, true)
  }
  return [
    load(songAt(p), header),
    load(voicesAt(p), (song.voices ?? []).flatMap(voice)),
    ...song.tracks.map((bytes, i) => load(partAt(p, i), bytes)),
    load(playerAt(p), new Uint8Array(player.buffer)),
    ...parts.map((part, i) =>
      load(trackAt(p, i), [0xc0, ...new Array<number>(0x3f).fill(0), ...address(part)]),
    ),
  ]
}

function setup(scene: Scene): Op[] {
  const cgb = [1, 2, 3, 4].flatMap((type) => [0, type, ...new Array<number>(CHANNEL - 2).fill(0)])
  return [
    load(SOUND_INFO_POINTER, address(SOUND_INFO)),
    load(SOUND_INFO, soundInfo(scene.songs.length)),
    sound(1, JUMP_TABLE),
    load(JUMP_TABLE + 28 * 4, address(FN.xcmd)),
    load(CGB_CHANS, cgb),
    ...scene.songs.flatMap(songOps),
    ...(scene.data ?? []).map(({ at, bytes }) => load(at, bytes)),
  ]
}

/**
 * The harness's sound calls (operation 13): 0 the players' frame as SoundMain runs it
 * (MPlayMainHead on musicPlayerHead), 1 MPlayJumpTableCopy(a), 2 TrackStop(a, b),
 * 3 RealClearChain(a), 4 umul3232H32(a, b), which appends its result word, 5 SoundMain,
 * 6 m4aSoundVSync, 7 SoundMainBTM(a).
 */
export const sound = (call: number, a = 0, b = 0): Op => [13, call, a, b]

/** Runs the scene for `frames` frames and reads the engine back after each one. */
export function runSound(host: string, scene: Scene, frames: number): Frame[] {
  const players = scene.songs.length
  const reads: Op[] = [
    read(CHANS, PCM_CHANNELS * CHANNEL),
    read(CGB_CHANS, 4 * CHANNEL),
    read(PLAYERS, players * PLAYER),
    read(TRACKS, players * TRACK_SLOTS * TRACK),
    read(HOST_LOG, LOG_BYTES),
    read(scene.probe?.at ?? HOST_LOG, scene.probe?.length ?? 0),
  ]
  const frameBytes = reads.reduce((sum, op) => sum + (op[2] as number), 0)
  const ops = setup(scene)
  for (let frame = 0; frame < frames; frame++) {
    const run = scene.mixer === true ? [sound(6), sound(5)] : [sound(0)]
    ops.push(...(scene.before?.[frame] ?? []), ...run, ...reads)
  }
  const { dest } = runScript(host, ops, frames * frameBytes)
  return Array.from({ length: frames }, (_, frame) =>
    readFrame(dest.subarray(frame * frameBytes, (frame + 1) * frameBytes), scene),
  )
}

function readFrame(bytes: Uint8Array, scene: Scene): Frame {
  const psgAtByte = PCM_CHANNELS * CHANNEL
  const playersAt = psgAtByte + 4 * CHANNEL
  const tracksAt = playersAt + scene.songs.length * PLAYER
  const logAt = tracksAt + scene.songs.length * TRACK_SLOTS * TRACK
  const log = new DataView(bytes.buffer, bytes.byteOffset + logAt, LOG_BYTES)
  const count = log.getUint32(0, true)
  return {
    pcm: list(bytes, PCM_CHANNELS, CHANNEL, CHANNEL_FIELDS),
    psg: list(bytes.subarray(psgAtByte), 4, CHANNEL, CHANNEL_FIELDS),
    players: list(bytes.subarray(playersAt), scene.songs.length, PLAYER, PLAYER_FIELDS),
    tracks: scene.songs.map((song, p) =>
      list(
        bytes.subarray(tracksAt + p * TRACK_SLOTS * TRACK),
        song.tracks.length,
        TRACK,
        TRACK_FIELDS,
      ),
    ),
    oscOff: Array.from({ length: count }, (_, i) => log.getUint32(4 + 4 * i, true)),
    probe: Array.from(bytes.subarray(logAt + LOG_BYTES)),
  }
}
