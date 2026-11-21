/// <reference types="emscripten" />
// The page's emulator: @thenick775/mgba-wasm behind the few calls the viewer makes (plan S5b §3).
// The built ROM holds the user's dump, so it stays in the module's in-memory file system: the
// adapter never calls FSInit or FSSync, which would mount IndexedDB and store it in the browser,
// and turns autosave and its restore off before the first game loads. The viewer presses no key.
import type { mGBAEmulator } from '@thenick775/mgba-wasm'

/** A ROM the emulator refuses, or a Restart it cannot do. */
export class EmulatorError extends Error {
  override name = 'EmulatorError'
}

/** The file system calls the adapter makes; Emscripten's FS has them all. */
interface ReplayFs {
  analyzePath(path: string): { readonly exists: boolean }
  mkdir(path: string): unknown
  unlink(path: string): void
  writeFile(path: string, data: Uint8Array): void
}

/** The part of mGBA's module the adapter uses, so a spec can stand in for it. */
export type EmulatorCore = Pick<
  mGBAEmulator,
  'setCoreSettings' | 'loadGame' | 'quitGame' | 'quickReload' | 'toggleInput' | 'addCoreCallbacks'
> & {
  readonly FS: ReplayFs
  /** Created with the game's audio, so absent before it; sound is best effort. */
  readonly SDL2?: { readonly audioContext?: Pick<AudioContext, 'state' | 'resume'> }
}

/** What the page asks of the emulator. */
export interface Emulator {
  /** Loads `rom` in place of any running game and starts it. */
  run(rom: Uint8Array): void
  /** Resets the running game, so the ROM plays its replay from the start. */
  restart(): void
  /** `listener` gets the status line when the core crashes. */
  onCrash(listener: (line: string) => void): void
}

const FOLDER = '/replay'
const IMAGE = `${FOLDER}/irv-emerald.gba`
const SAVE = `${FOLDER}/irv-emerald.sav`
const CRASH_LINE = 'The emulator crashed. Press Start to run the replay again.'

// mGBA's defaults write a savestate every 30 s and restore it on load and on quickReload.
const QUIET = { autoSaveStateEnable: false, restoreAutoSaveStateOnLoad: false, rewindEnable: false }

type GameState = 'none' | 'running' | 'crashed'

/** Starts a suspended audio context; a refusal leaves the replay silent and nothing else. */
function wakeAudio(core: EmulatorCore): void {
  const context = core.SDL2?.audioContext
  if (context?.state === 'suspended') {
    context.resume().catch(() => undefined)
  }
}

/** The adapter over a loaded mGBA module. */
export function createEmulator(core: EmulatorCore): Emulator {
  let state: GameState = 'none'
  let prepared = false
  const listeners: ((line: string) => void)[] = []
  const crashed = (): void => {
    state = 'crashed'
    for (const listener of listeners) listener(CRASH_LINE)
  }

  const prepare = (): void => {
    core.FS.mkdir(FOLDER)
    core.setCoreSettings(QUIET)
    prepared = true
  }
  // A fresh image and a blank save each Start, so every run boots the same way.
  const replaceImage = (rom: Uint8Array): void => {
    if (state !== 'none') core.quitGame()
    state = 'none'
    for (const path of [IMAGE, SAVE]) {
      if (core.FS.analyzePath(path).exists) core.FS.unlink(path)
    }
    core.FS.writeFile(IMAGE, rom)
  }

  return {
    run: (rom) => {
      if (!prepared) prepare()
      replaceImage(rom)
      if (!core.loadGame(IMAGE, SAVE))
        throw new EmulatorError('The emulator did not accept the ROM.')
      state = 'running'
      // Each loadGame makes a new core, which starts without the last one's callbacks.
      core.addCoreCallbacks({ coreCrashedCallback: crashed })
      core.toggleInput(false)
      wakeAudio(core)
    },
    restart: () => {
      if (state === 'none') throw new EmulatorError('No replay runs yet: press Start first.')
      if (state === 'crashed') throw new EmulatorError(CRASH_LINE)
      core.quickReload()
      wakeAudio(core)
    },
    onCrash: (listener) => {
      listeners.push(listener)
    },
  }
}

/** Loads mGBA into `canvas`; the page calls it at the first Start, not on load. */
export async function loadEmulator(canvas: HTMLCanvasElement): Promise<Emulator> {
  const { default: mGBA } = await import('@thenick775/mgba-wasm')
  return createEmulator(await mGBA({ canvas }))
}
