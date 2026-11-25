// The test hook the Gen 5 spike page puts on `window.gen5` (#72), which scripts/gen5-shot.ts reads
// through Playwright. One type for both sides; the page fills it, the script only calls it.
import { BUTTON, type MacroStep } from './macro.ts'
import type { RamRef } from './ram-check.ts'

/** The device figures the page measures at load, to set this machine beside another device. */
export interface Calibration {
  /** navigator.hardwareConcurrency. */
  cores: number
  /** Turns of pace.ts's loop on the page's thread in `loopMs`. */
  loopTurns: number
  loopMs: number
}

/** What a scan of the core's heap for DS main RAM found; offsets are into the heap. */
export interface MainRamReport {
  /** The base when exactly one candidate holds both facts, else -1. */
  base: number
  bases: number[]
  headerHits: number[]
  heapBytes: number
  scanMs: number
  /** The game code in the header copy at the base, '' without one. */
  gameCode: string
}

/** A macro run: the steps, the state to start from (base64) at its emulated frame, and the values
 * to log each time one changes while an `until` step waits. */
export interface RunPlan {
  steps: MacroStep[]
  state?: string
  /** The SHA-256 of main RAM saved with the state, to check the load. */
  stateSha?: string | undefined
  startFrame: number
  watch: RamRef[]
  /** Values read at each mark, such as the player's position. */
  markRefs?: RamRef[]
  /** The marks that save a state; without the list every mark does. The others take a frame. */
  stateMarks?: string[]
}

/** A mark the run reached: emulated frame, the page's frame counter, wall time since the run
 * started, the state's size and a SHA-256 of main RAM at that frame once it is computed. */
export interface MarkRecord {
  name: string
  frame: number
  pageFrame: number
  wallMs: number
  stateBytes: number
  /** The plan's mark values at that frame. */
  values: string
  ramSha?: string
}

export interface RunReport {
  status: 'idle' | 'queued' | 'running' | 'done' | 'failed'
  /** The emulated frame the run is at, counted from boot even when it started from a state. */
  frame: number
  step: number
  failed?: string
  marks: MarkRecord[]
  /** Changes of the watched values, one line per frame that changed one. */
  watch: string[]
  /** Frames the core ran between two calls of the frame hook (each got the earlier input). */
  jumps: number
  /** Whether main RAM after a state load equals the hash saved with the state. */
  loadCheck?: string
}

/** The game's save as the core holds it (#78). */
export interface SaveReport {
  /** The path the core reports for its save file. */
  path: string
  /** The file system of the save folder; MEMFS on this page (src/web/gen5/save-load.ts). */
  mount: string
  /** The file in base64, its SHA-256 and its size; absent while the core has written none. */
  file?: { base64: string; sha256: string; bytes: number }
}

export interface Gen5Hook {
  /** The page's status line. */
  status: () => string
  /** True once EmulatorJS reports that the game started. */
  started: () => boolean
  /** The core's frame counter. */
  frames: () => number
  /** The core's options as the core lists them. */
  coreOptions: () => string
  /** The core's own frame as PNG bytes in base64, which needs no WebGL readback. */
  screenshot: () => Promise<string>
  /** Holds a RetroPad button (libretro's joypad index) down for `ms` milliseconds. */
  press: (button: number, ms: number) => void
  /** Which core build runs: 'plain' or 'thread'. */
  core: () => string
  /** The page's calibration once it ran. */
  calibration: () => Calibration | undefined
  /** Fast-forward with no ratio cap (EmulatorJS's "unlimited" is ratio 0), or off. */
  uncapped: (on: boolean) => void
  /** Fast-forward on at `ratio` times the DS's rate (0 has no limit), or off for undefined. */
  fastForward: (ratio: number | undefined) => void
  /** Vsync on (each core frame waits for requestAnimationFrame) or off (src/gen5/pacing.ts). */
  vsync: (on: boolean) => void
  /** The line that the page's "Copy figures" button copies (src/gen5/figures.ts). */
  figures: () => string
  /** Scans the heap for main RAM and keeps the base for the calls below. */
  findMainRam: () => MainRamReport
  /** A 32-bit word of main RAM at a DS address, through the kept base. */
  readWord: (address: number) => number
  writeWord: (address: number, value: number) => void
  /** `length` bytes of main RAM from a DS address, in base64. */
  readBytes: (address: number, length: number) => string
  /** The DS address of the middle word in main RAM's longest run of zero words. */
  quietWord: () => number
  /** Plays a macro from the next emulated frame (before the pick: from boot's first frame). */
  queueRun: (plan: RunPlan) => void
  runReport: () => RunReport
  /** A reached mark's state and the core's frame near it, in base64, handed over once. */
  takeMark: (name: string) => Promise<{ state: string; shot: string } | undefined>
  /** Loads these bytes (base64) as the game's save when it starts; call it before the pick. For
   * the build machine's own saves, which no server serves. A save the address names wins. */
  queueSave: (base64: string) => void
  /** The save once the core wrote save RAM to its file; undefined before the game runs. */
  takeSave: () => Promise<SaveReport | undefined>
}

/** libretro's joypad index of Start (RETRO_DEVICE_ID_JOYPAD_START in libretro.h). */
export const RETRO_START = BUTTON.Start

/** What the page's global object holds, for code that runs in the page from outside. */
export interface Gen5Global {
  gen5: Gen5Hook
}
