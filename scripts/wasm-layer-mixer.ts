// The PCM mixer of our platform layer (#43, B8b) as the specs drive it through the harness's
// `script` command: a SoundInfo at the module's 42048 Hz with its channels as ply_note leaves
// them, m4aSoundVSync and SoundMain once per frame, and the segment just mixed, the channels and
// the samples handed to the host read back. Offsets are the MP2K spec's (sections 2.4, 6.1-6.5).
import { address, ID, SOUND_INFO, SOUND_INFO_POINTER, sound } from './wasm-layer-mp2k.ts'
import { asFloats, halves, load, type Op, read, runScript, wordBytes } from './wasm-layer-script.ts'

const CHANS = SOUND_INFO + 0x50
const CHANNEL = 0x40
const PCM_CHANNELS = 12
/** MP2K spec 6.1: the buffer's right half (FIFO A), then its left half (FIFO B). */
const HALF = 1584
const PCM_BUFFER = CHANS + PCM_CHANNELS * CHANNEL
const INFO_BYTES = PCM_BUFFER - SOUND_INFO + 2 * HALF
/** The harness's IrvSound_HandOver (layer/host/irv_layer_host_mp2k.c): count, rate, pairs. */
const HOST_AUDIO = 0x02040000
const SOUNDCNT_H = 0x04000082

/** SOUNDCNT_H as SoundInit leaves it (A right, B left, all at 100 %) and in mono (MP2K spec 7). */
export const STEREO = 0x210e
export const MONO = 0x3302

export interface Mixer {
  samples?: number
  period?: number
  freq?: number
  divFreq?: number
  reverb?: number
  maxChans?: number
  masterVolume?: number
}

/** The SoundInfo fields the mixer reads, as m4aSoundInit leaves them at 42048 Hz (MP2K spec 6.1). */
export function mixerInfo(mixer: Mixer = {}): { at: number; bytes: number[] }[] {
  const { reverb = 0, maxChans = 5, masterVolume = 12, period = 2 } = mixer
  const words = [mixer.samples ?? 704, mixer.freq ?? 42048, mixer.divFreq ?? 200]
  return [
    { at: SOUND_INFO + 5, bytes: [reverb, maxChans, masterVolume] },
    { at: SOUND_INFO + 11, bytes: [period] },
    { at: SOUND_INFO + 0x10, bytes: wordBytes(words) },
  ]
}

/** A sample (MP2K spec 2.4); `data` holds signed bytes. */
export interface Wave {
  compressed?: boolean
  loop?: boolean
  freq?: number
  loopStart?: number
  size: number
  data: readonly number[]
}
export function waveBytes(wave: Wave): number[] {
  const head = halves([wave.compressed === true ? 1 : 0, wave.loop === true ? 0x4000 : 0])
  const words = wordBytes([wave.freq ?? 0, wave.loopStart ?? 0, wave.size])
  return [...head, ...words, ...wave.data.map((byte) => byte & 0xff)]
}

/** A DirectSound channel as ply_note leaves it (MP2K spec 5.6). */
interface MixChannel {
  type?: number
  wave: number
  frequency?: number
  status?: number
  /** attack, decay, sustain, release */
  envelope?: readonly number[]
  /** rightVolume, leftVolume */
  volume?: readonly number[]
  /** The start offset in `count`, or the samples left for a channel that already plays. */
  offset?: number
  /** pseudoEchoVolume, pseudoEchoLength */
  echo?: readonly number[]
  /** envelopeVolume, for a channel that already plays */
  level?: number
}
function channelBytes(chan: MixChannel): number[] {
  const bytes = new Uint8Array(CHANNEL)
  const view = new DataView(bytes.buffer)
  bytes.set([chan.status ?? 0x80, chan.type ?? 0, ...(chan.volume ?? [255, 255])], 0)
  bytes.set(chan.envelope ?? [255, 0, 255, 0], 4)
  bytes[0x09] = chan.level ?? 0
  bytes.set(chan.echo ?? [0, 0], 0x0c)
  view.setUint32(0x18, chan.offset ?? 0, true)
  view.setUint32(0x20, chan.frequency ?? 0, true)
  view.setUint32(0x24, chan.wave, true)
  return Array.from(bytes)
}

export interface MixScene {
  mixer?: Mixer
  channels: readonly MixChannel[]
  waves: readonly { at: number; wave: Wave }[]
  /** SOUNDCNT_H; SOUNDCNT_X has the master enable. */
  control?: number
  /** Operations before the given frame's m4aSoundVSync. */
  before?: Readonly<Record<number, readonly Op[]>>
}

interface MixState {
  status: number
  envelope: number
  envelopeRight: number
  envelopeLeft: number
  count: number
  fraction: number
}
export interface MixFrame {
  counter: number
  /** The segment this frame mixed (MP2K spec 6.2), both halves as signed bytes. */
  right: number[]
  left: number[]
  /** The whole buffer's two halves. */
  buffer: Int8Array
  chans: MixState[]
  rate: number
  /** The pairs handed to the host, left and right interleaved. */
  audio: number[]
}

function setup(scene: MixScene): Op[] {
  const info = [...wordBytes([ID]), ...new Array<number>(INFO_BYTES - 4).fill(0)]
  return [
    load(SOUND_INFO_POINTER, address(SOUND_INFO)),
    load(SOUND_INFO, info),
    ...mixerInfo(scene.mixer).map(({ at, bytes }) => load(at, bytes)),
    load(CHANS, scene.channels.flatMap(channelBytes)),
    ...scene.waves.map(({ at, wave }) => load(at, waveBytes(wave))),
    load(SOUNDCNT_H, halves([scene.control ?? STEREO, 0x80])),
  ]
}

function readMix(bytes: Uint8Array, samples: number, period: number): MixFrame {
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  const counter = bytes[4] ?? 0
  const segment = counter >= 2 && counter <= period ? period - (counter - 1) : 0
  const buffer = new Int8Array(bytes.buffer, bytes.byteOffset + PCM_BUFFER - SOUND_INFO, 2 * HALF)
  const at = segment * samples
  const chans = Array.from({ length: PCM_CHANNELS }, (_, i) => {
    const base = CHANS - SOUND_INFO + i * CHANNEL
    return {
      status: view.getUint8(base),
      envelope: view.getUint8(base + 0x09),
      envelopeRight: view.getUint8(base + 0x0a),
      envelopeLeft: view.getUint8(base + 0x0b),
      count: view.getInt32(base + 0x18, true),
      fraction: view.getUint32(base + 0x1c, true),
    }
  })
  const audioAt = INFO_BYTES
  const count = view.getUint32(audioAt, true)
  return {
    counter,
    right: Array.from(buffer.subarray(at, at + samples)),
    left: Array.from(buffer.subarray(HALF + at, HALF + at + samples)),
    buffer: buffer.slice(),
    chans,
    rate: view.getUint32(audioAt + 4, true),
    audio: asFloats(bytes.slice(audioAt + 8, audioAt + 8 + count * 8)),
  }
}

/** Runs the scene for `frames` frames: m4aSoundVSync, SoundMain, then the reads. */
export function runMixer(host: string, scene: MixScene, frames: number): MixFrame[] {
  const samples = scene.mixer?.samples ?? 704
  const frameBytes = INFO_BYTES + 8 + samples * 8
  const ops = setup(scene)
  for (let frame = 0; frame < frames; frame++) {
    ops.push(...(scene.before?.[frame] ?? []), sound(6), sound(5))
    ops.push(read(SOUND_INFO, INFO_BYTES), read(HOST_AUDIO, 8 + samples * 8))
  }
  const { dest } = runScript(host, ops, frames * frameBytes)
  return Array.from({ length: frames }, (_, frame) =>
    readMix(dest.subarray(frame * frameBytes), samples, scene.mixer?.period ?? 2),
  )
}

/** MP2K spec 6.4: the channel's output level for an envelope, master volume and volume. */
export const outputLevel = (envelope: number, volume: number, masterVolume = 12) =>
  (volume * ((envelope * (masterVolume + 1)) >> 4)) >> 8
/** MP2K spec 6.5: what one source value adds to the buffer at an output level. */
export const added = (level: number, value: number) => Math.floor((level * value) / 256)
