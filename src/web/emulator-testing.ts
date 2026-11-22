// Helpers for the emulator's specs: a stand-in for mGBA's module, a stand-in for an audio
// context, and the synthetic images they run.
import type { EmulatorCore } from './emulator'

export const IMAGE = '/replay/irv-emerald.gba'
export const SAVE = '/replay/irv-emerald.sav'

export const ROM = Uint8Array.from({ length: 0x200 }, (_, index) => (index * 7) & 0xff)
export const OTHER_ROM = Uint8Array.from({ length: 0x200 }, (_, index) => (index * 13) & 0xff)

/** An audio context that logs what was asked of it; `refuses` makes its resume fail. */
export interface FakeAudioContext {
  state: AudioContextState
  readonly name: string
  readonly asked: string[]
  refuses: boolean
  resume(): Promise<void>
  close(): Promise<void>
}

export function fakeAudioContext(name: string, state: AudioContextState): FakeAudioContext {
  const context: FakeAudioContext = {
    state,
    name,
    asked: [],
    refuses: false,
    resume: () => {
      context.asked.push('resume')
      if (context.refuses) return Promise.reject(new Error('not allowed'))
      context.state = 'running'
      return Promise.resolve()
    },
    close: () => {
      context.asked.push('close')
      context.state = 'closed'
      return Promise.resolve()
    },
  }
  return context
}

/** A stand-in for mGBA's module: an in-memory file system and a log of every call, in order. */
export interface FakeCore extends EmulatorCore {
  readonly calls: string[]
  readonly files: Map<string, Uint8Array>
  /** The audio context SDL2 held at each loadGame, in order. */
  readonly contextsAtLoad: unknown[]
  /** What the next loadGame answers for a file that exists. */
  accepts: boolean
  /** The core hits a crash: the callback registered for the running game fires. */
  crash(): void
}

// The fake keeps the fork's rules that the adapter depends on (src/platform/wasm/main.c):
// writeFile needs its folder; loadGame quits a running game and makes a new core, which starts
// without the callbacks addCoreCallbacks gave the old one; the save file appears on load.
// quitGame closes SDL's audio, and with it SDL's audio context, which it then forgets.
export function fakeCore(): FakeCore {
  const calls: string[] = []
  const files = new Map<string, Uint8Array>()
  const folders = new Set<string>(['/'])
  let crashed: (() => void) | null | undefined
  let loaded = false
  const core: FakeCore = {
    calls,
    files,
    contextsAtLoad: [],
    accepts: true,
    crash: () => crashed?.(),
    FS: {
      analyzePath: (path: string) => ({ exists: folders.has(path) || files.has(path) }),
      mkdir: (path: string) => {
        calls.push(`mkdir ${path}`)
        if (folders.has(path)) throw new Error(`EEXIST ${path}`)
        folders.add(path)
      },
      unlink: (path: string) => {
        calls.push(`unlink ${path}`)
        if (!files.delete(path)) throw new Error(`ENOENT ${path}`)
      },
      writeFile: (path: string, data: Uint8Array) => {
        calls.push(`writeFile ${path}`)
        if (!folders.has(path.slice(0, path.lastIndexOf('/')))) throw new Error(`ENOENT ${path}`)
        files.set(path, new Uint8Array(data))
      },
    },
    setCoreSettings: (settings) => calls.push(`setCoreSettings ${JSON.stringify(settings)}`),
    loadGame: (romPath: string, savePath?: string) => {
      calls.push(`loadGame ${romPath} ${String(savePath)}`)
      core.contextsAtLoad.push(core.SDL2?.audioContext)
      crashed = undefined
      loaded = files.has(romPath) && core.accepts
      if (loaded && savePath !== undefined) files.set(savePath, new Uint8Array(0))
      return loaded
    },
    quitGame: () => {
      calls.push('quitGame')
      loaded = false
      const sdl = core.SDL2
      if (sdl?.audioContext !== undefined) {
        void sdl.audioContext.close()
        sdl.audioContext = undefined
      }
    },
    quickReload: () => calls.push('quickReload'),
    toggleInput: (enabled: boolean) => calls.push(`toggleInput ${String(enabled)}`),
    addCoreCallbacks: (callbacks) => {
      calls.push(`addCoreCallbacks ${Object.keys(callbacks).join(',')}`)
      if (loaded) crashed = callbacks.coreCrashedCallback
    },
  }
  return core
}
