import { describe, expect, it, vi } from 'vitest'

import { createEmulator, EmulatorError, loadEmulator } from './emulator'
import { fakeCore, IMAGE, OTHER_ROM, ROM, SAVE } from './emulator-testing'

const QUIET = { autoSaveStateEnable: false, restoreAutoSaveStateOnLoad: false, rewindEnable: false }
const CRASH_LINE = 'The emulator crashed. Press Start to run the replay again.'

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
