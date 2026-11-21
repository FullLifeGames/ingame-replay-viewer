import { describe, expect, it, vi } from 'vitest'

import { createEmulator, type EmulatorCore, EmulatorError, loadEmulator } from './emulator'

const IMAGE = '/replay/irv-emerald.gba'
const SAVE = '/replay/irv-emerald.sav'
const QUIET = { autoSaveStateEnable: false, restoreAutoSaveStateOnLoad: false, rewindEnable: false }
const CRASH_LINE = 'The emulator crashed. Press Start to run the replay again.'

/** A stand-in for mGBA's module: an in-memory file system and a log of every call, in order. */
interface FakeCore extends EmulatorCore {
  readonly calls: string[]
  readonly files: Map<string, Uint8Array>
  /** What the next loadGame answers for a file that exists. */
  accepts: boolean
  /** The core hits a crash: the callback registered for the running game fires. */
  crash(): void
}

// The fake keeps the fork's rules that the adapter depends on (src/platform/wasm/main.c):
// writeFile needs its folder; loadGame quits a running game and makes a new core, which starts
// without the callbacks addCoreCallbacks gave the old one; the save file appears on load.
function fakeCore(): FakeCore {
  const calls: string[] = []
  const files = new Map<string, Uint8Array>()
  const folders = new Set<string>(['/'])
  let crashed: (() => void) | null | undefined
  let loaded = false
  const core: FakeCore = {
    calls,
    files,
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
      crashed = undefined
      loaded = files.has(romPath) && core.accepts
      if (loaded && savePath !== undefined) files.set(savePath, new Uint8Array(0))
      return loaded
    },
    quitGame: () => {
      calls.push('quitGame')
      loaded = false
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

const ROM = Uint8Array.from({ length: 0x200 }, (_, index) => (index * 7) & 0xff)
const OTHER_ROM = Uint8Array.from({ length: 0x200 }, (_, index) => (index * 13) & 0xff)

describe('createEmulator', () => {
  // Start on a fresh page: nothing may reach the browser's storage, and the viewer presses nothing.
  it('loads the ROM from memory with autosave, restore and rewind off, then turns input off', () => {
    const core = fakeCore()
    createEmulator(core).run(ROM)

    expect(core.calls).toEqual([
      'mkdir /replay',
      `setCoreSettings ${JSON.stringify(QUIET)}`,
      `writeFile ${IMAGE}`,
      `loadGame ${IMAGE} ${SAVE}`,
      'addCoreCallbacks coreCrashedCallback',
      'toggleInput false',
    ])
    expect(core.files.get(IMAGE)).toEqual(ROM)
  })

  // Start with another replay: the next image replaces the running one, with a blank save.
  it('quits the running game and replaces its image and save on the next Start', () => {
    const core = fakeCore()
    const emulator = createEmulator(core)
    emulator.run(ROM)
    core.calls.length = 0
    emulator.run(OTHER_ROM)

    expect(core.calls).toEqual([
      'quitGame',
      `unlink ${IMAGE}`,
      `unlink ${SAVE}`,
      `writeFile ${IMAGE}`,
      `loadGame ${IMAGE} ${SAVE}`,
      'addCoreCallbacks coreCrashedCallback',
      'toggleInput false',
    ])
    expect(core.files.get(IMAGE)).toEqual(OTHER_ROM)
  })

  it('refuses a ROM the emulator does not accept and runs nothing', () => {
    const core = fakeCore()
    core.accepts = false
    const emulator = createEmulator(core)

    expect(() => {
      emulator.run(ROM)
    }).toThrow(new EmulatorError('The emulator did not accept the ROM.'))
    expect(core.calls).not.toContain('toggleInput false')
    expect(() => {
      emulator.restart()
    }).toThrow(EmulatorError)
  })

  it('starts again after a refused ROM without quitting a game that never ran', () => {
    const core = fakeCore()
    core.accepts = false
    const emulator = createEmulator(core)
    expect(() => {
      emulator.run(ROM)
    }).toThrow(EmulatorError)
    core.accepts = true
    core.calls.length = 0
    emulator.run(OTHER_ROM)

    expect(core.calls).toEqual([
      `unlink ${IMAGE}`,
      `writeFile ${IMAGE}`,
      `loadGame ${IMAGE} ${SAVE}`,
      'addCoreCallbacks coreCrashedCallback',
      'toggleInput false',
    ])
  })

  // Restart: the same image boots again, so the ROM plays the replay from its first instruction.
  it('restarts the running game with a quick reload', () => {
    const core = fakeCore()
    const emulator = createEmulator(core)
    emulator.run(ROM)
    core.calls.length = 0
    emulator.restart()

    expect(core.calls).toEqual(['quickReload'])
  })

  it('refuses Restart before Start', () => {
    const core = fakeCore()

    expect(() => {
      createEmulator(core).restart()
    }).toThrow(new EmulatorError('No replay runs yet: press Start first.'))
    expect(core.calls).toEqual([])
  })

  it('tells the page when the core crashes', () => {
    const core = fakeCore()
    const emulator = createEmulator(core)
    const lines: string[] = []
    emulator.onCrash((line) => lines.push(line))
    emulator.run(ROM)
    core.crash()

    expect(lines).toEqual([CRASH_LINE])
  })

  // loadGame makes a new core, which knows nothing of the callbacks the last one had.
  it('tells the page of a crash in the game that a second Start loaded', () => {
    const core = fakeCore()
    const emulator = createEmulator(core)
    const lines: string[] = []
    emulator.run(ROM)
    emulator.onCrash((line) => lines.push(line))
    emulator.run(OTHER_ROM)
    core.crash()

    expect(lines).toEqual([CRASH_LINE])
  })

  it('refuses Restart after a crash and runs again on Start', () => {
    const core = fakeCore()
    const emulator = createEmulator(core)
    emulator.run(ROM)
    core.crash()

    expect(() => {
      emulator.restart()
    }).toThrow(new EmulatorError(CRASH_LINE))
    emulator.run(ROM)
    core.calls.length = 0
    emulator.restart()
    expect(core.calls).toEqual(['quickReload'])
  })

  // quitGame closes SDL's audio device, but an audio event already queued for the old game's
  // node still runs its handler, which calls into the closed device ("divide by zero").
  it("drops the running game's audio handler before it quits the game", () => {
    const node: { onaudioprocess: (() => void) | null } = { onaudioprocess: () => undefined }
    const core: FakeCore = Object.assign(fakeCore(), {
      SDL2: { audio: { scriptProcessorNode: node } },
    })
    const emulator = createEmulator(core)
    emulator.run(ROM)
    const quit = core.quitGame
    let handlerAtQuit: unknown = 'never quit'
    core.quitGame = () => {
      handlerAtQuit = node.onaudioprocess
      quit()
    }
    emulator.run(OTHER_ROM)

    expect(handlerAtQuit).toBeNull()
  })

  // Sound needs a user gesture; Start and Restart are the page's gestures.
  it('resumes a suspended audio context on Start and Restart', () => {
    const resume = vi.fn(() => Promise.resolve())
    const core: FakeCore = Object.assign(fakeCore(), {
      SDL2: { audioContext: { state: 'suspended', resume } },
    })
    const emulator = createEmulator(core)
    emulator.run(ROM)
    emulator.restart()

    expect(resume).toHaveBeenCalledTimes(2)
  })

  it('leaves a running audio context alone and runs without one', () => {
    const resume = vi.fn(() => Promise.resolve())
    const running = Object.assign(fakeCore(), {
      SDL2: { audioContext: { state: 'running', resume } },
    })
    createEmulator(running).run(ROM)
    const silent = Object.assign(fakeCore(), { SDL2: {} })
    createEmulator(silent).run(ROM)

    expect(resume).not.toHaveBeenCalled()
    expect(silent.files.get(IMAGE)).toEqual(ROM)
  })

  it('reports a refused audio resume as nothing, since sound is best effort', async () => {
    const resume = vi.fn(() => Promise.reject(new Error('not allowed')))
    const core = Object.assign(fakeCore(), {
      SDL2: { audioContext: { state: 'suspended', resume } },
    })
    createEmulator(core).run(ROM)
    await Promise.resolve()

    expect(resume).toHaveBeenCalledOnce()
    expect(core.files.get(IMAGE)).toEqual(ROM)
  })
})

const mGBA = vi.hoisted(() => vi.fn())
vi.mock('@thenick775/mgba-wasm', () => ({ default: mGBA }))

describe('loadEmulator', () => {
  // The first Start loads mGBA; its file system stays in memory, so IndexedDB stays empty.
  it('hands the canvas to mGBA and never mounts or syncs its file system', async () => {
    const FSInit = vi.fn()
    const FSSync = vi.fn()
    const core = Object.assign(fakeCore(), { FSInit, FSSync })
    mGBA.mockResolvedValueOnce(core)
    const canvas = { width: 240, height: 160 }
    const emulator = await loadEmulator(canvas as HTMLCanvasElement)
    emulator.run(ROM)
    emulator.restart()

    expect(mGBA).toHaveBeenCalledExactlyOnceWith({ canvas })
    expect(FSInit).not.toHaveBeenCalled()
    expect(FSSync).not.toHaveBeenCalled()
    expect(core.files.get(IMAGE)).toEqual(ROM)
  })
})
