// The replay progress that the interpreter keeps in gReplayProgress (rom/gen3/include/
// replay_progress.h): its layout read from the header's defines, and one reading of it from
// memory. DOM-free: the page's worker reads the header through the bundler (?raw), the shot
// tooling and the Node harness through the file system (scripts/rom-shot-run.ts).
import { widenChannel } from './frame.ts'

/** The byte offsets of the fields of struct ReplayProgress. */
interface ProgressOffsets {
  done: number
  total: number
  turn: number
  error: number
  finished: number
  playing: number
}

export interface ProgressLayout {
  /** sizeof(struct ReplayProgress). */
  size: number
  offsets: ProgressOffsets
  /** The refusal screen's backdrop as the tool's frames show it, 0xRRGGBB. */
  refusedColour: number
}

/** gReplayProgress at one moment. */
export interface Progress {
  done: number
  total: number
  turn: number
  error: number
  finished: boolean
  playing: boolean
}

function readNumberDefine(headerText: string, name: string): number {
  const text = new RegExp(`^#define\\s+${name}\\s+(.+?)\\s*(?://.*)?$`, 'm').exec(headerText)?.[1]
  if (text === undefined) throw new Error(`replay_progress.h: ${name} missing`)
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) {
    throw new Error(`replay_progress.h: ${name} is "${text}", not a plain number`)
  }
  return Number(text)
}

const offset = (headerText: string, field: string) =>
  readNumberDefine(headerText, `REPLAY_PROGRESS_OFFSET_${field}`)

export function readProgressLayout(headerText: string): ProgressLayout {
  const offsets: ProgressOffsets = {
    done: offset(headerText, 'DONE'),
    total: offset(headerText, 'TOTAL'),
    turn: offset(headerText, 'TURN'),
    error: offset(headerText, 'ERROR'),
    finished: offset(headerText, 'FINISHED'),
    playing: offset(headerText, 'PLAYING'),
  }
  const size = readNumberDefine(headerText, 'REPLAY_PROGRESS_SIZE')
  const red = readNumberDefine(headerText, 'REPLAY_REFUSED_RED')
  return { size, offsets, refusedColour: widenChannel(red) << 16 }
}

/** The progress at byte `at` of `memory`. */
export function readProgress(memory: Uint8Array, at: number, layout: ProgressLayout): Progress {
  const view = new DataView(memory.buffer, memory.byteOffset + at, layout.size)
  const { offsets } = layout
  return {
    done: view.getUint16(offsets.done, true),
    total: view.getUint16(offsets.total, true),
    turn: view.getUint16(offsets.turn, true),
    error: view.getUint8(offsets.error),
    finished: view.getUint8(offsets.finished) !== 0,
    playing: view.getUint8(offsets.playing) !== 0,
  }
}
