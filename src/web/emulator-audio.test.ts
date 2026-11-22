// The emulator page's sound (#51). Firefox lets a page start audio only during a tap, and mGBA
// loads seconds after the Start tap, so the tap opens the context and the run hands it to SDL2.
import { describe, expect, it, vi } from 'vitest'

import { audioHandOver, createEmulator, loadEmulator } from './emulator'
import {
  fakeAudioContext,
  type FakeAudioContext,
  fakeCore,
  type FakeCore,
  IMAGE,
  OTHER_ROM,
  ROM,
} from './emulator-testing'

/** A hand-over whose contexts come from a list, so a spec can name each Start's context. */
function handOverOf(...contexts: FakeAudioContext[]) {
  const made: FakeAudioContext[] = []
  const audio = audioHandOver(() => {
    const next = contexts[made.length]
    if (next === undefined) throw new Error('NotAllowedError')
    made.push(next)
    return next
  })
  return { audio, made }
}

describe('audioHandOver', () => {
  // The Start tap: a context born suspended gets its resume while the tap's activation lasts.
  it('resumes a suspended context inside the open, once', () => {
    const first = fakeAudioContext('first', 'suspended')
    const { audio } = handOverOf(first)
    audio.open()

    expect(first.asked).toEqual(['resume'])
    expect(audio.take()).toBe(first)
    expect(audio.take()).toBeUndefined()
  })

  it('leaves a running context alone and takes a refused resume as nothing', async () => {
    const running = fakeAudioContext('running', 'running')
    const refused = Object.assign(fakeAudioContext('refused', 'suspended'), { refuses: true })
    const { audio } = handOverOf(running, refused)
    audio.open()
    expect(audio.take()).toBe(running)
    audio.open()
    await Promise.resolve()

    expect(running.asked).toEqual([])
    expect(refused.asked).toEqual(['resume'])
    expect(audio.take()).toBe(refused)
  })

  // Two taps on Start before the first run: the first tap's context would never play.
  it('closes the context of an earlier open that no run took', () => {
    const first = fakeAudioContext('first', 'running')
    const second = fakeAudioContext('second', 'running')
    const { audio } = handOverOf(first, second)
    audio.open()
    audio.open()

    expect(first.asked).toEqual(['close'])
    expect(audio.take()).toBe(second)
  })

  it('has no context after an open the browser refuses', () => {
    const { audio } = handOverOf()

    expect(() => {
      audio.open()
    }).not.toThrow()
    expect(audio.take()).toBeUndefined()
  })
})

describe('createEmulator with a hand-over', () => {
  it("hands SDL2 the Start tap's context before the game loads", () => {
    const core = fakeCore()
    const first = fakeAudioContext('first', 'running')
    const { audio } = handOverOf(first)
    audio.open()
    createEmulator(core, audio).run(ROM)

    expect(core.contextsAtLoad).toEqual([first])
    expect(audio.take()).toBeUndefined()
  })

  // quitGame closes SDL's audio and its context, so the next Start's context must be fresh.
  it("hands over the second Start's context after quitGame closed the first", () => {
    const core = Object.assign(fakeCore(), { SDL2: {} })
    const first = fakeAudioContext('first', 'running')
    const second = fakeAudioContext('second', 'running')
    const { audio } = handOverOf(first, second)
    const emulator = createEmulator(core, audio)
    audio.open()
    emulator.run(ROM)
    audio.open()
    emulator.run(OTHER_ROM)

    expect(core.contextsAtLoad).toEqual([first, second])
    expect(first.asked).toEqual(['close'])
    expect(second.asked).toEqual([])
  })

  it('loads the game with no context of ours when the open failed', () => {
    const core = fakeCore()
    const { audio } = handOverOf()
    audio.open()
    createEmulator(core, audio).run(ROM)

    expect(core.contextsAtLoad).toEqual([undefined])
    expect(core.files.get(IMAGE)).toEqual(ROM)
  })

  // SDL keeps a context it holds; a second one would only take the device from it.
  it("closes the tap's context and leaves SDL's own alone", () => {
    const own = fakeAudioContext('own', 'running')
    const core: FakeCore = Object.assign(fakeCore(), { SDL2: { audioContext: own } })
    const first = fakeAudioContext('first', 'running')
    const { audio } = handOverOf(first)
    audio.open()
    createEmulator(core, audio).run(ROM)

    expect(core.contextsAtLoad).toEqual([own])
    expect(first.asked).toEqual(['close'])
    expect(own.asked).toEqual([])
  })
})

describe('createEmulator without a hand-over', () => {
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

  // Restart is a gesture too; Chrome accepts a resume after the page saw one.
  it('resumes a suspended audio context on Start and Restart', () => {
    const context = fakeAudioContext('sdl', 'suspended')
    const resume = vi.spyOn(context, 'resume').mockResolvedValue()
    const core: FakeCore = Object.assign(fakeCore(), { SDL2: { audioContext: context } })
    const emulator = createEmulator(core)
    emulator.run(ROM)
    emulator.restart()

    expect(resume).toHaveBeenCalledTimes(2)
  })

  it('leaves a running audio context alone and runs without one', () => {
    const context = fakeAudioContext('sdl', 'running')
    const running = Object.assign(fakeCore(), { SDL2: { audioContext: context } })
    createEmulator(running).run(ROM)
    const silent = Object.assign(fakeCore(), { SDL2: {} })
    createEmulator(silent).run(ROM)

    expect(context.asked).toEqual([])
    expect(silent.files.get(IMAGE)).toEqual(ROM)
  })

  it('reports a refused audio resume as nothing, since sound is best effort', async () => {
    const context = Object.assign(fakeAudioContext('sdl', 'suspended'), { refuses: true })
    const core = Object.assign(fakeCore(), { SDL2: { audioContext: context } })
    createEmulator(core).run(ROM)
    await Promise.resolve()

    expect(context.asked).toEqual(['resume'])
    expect(core.files.get(IMAGE)).toEqual(ROM)
  })
})

const mGBA = vi.hoisted(() => vi.fn())
vi.mock('@thenick775/mgba-wasm', () => ({ default: mGBA }))

describe('loadEmulator with a hand-over', () => {
  it('gives mGBA the canvas only, and its first run takes the context', async () => {
    const core = fakeCore()
    mGBA.mockResolvedValueOnce(core)
    const first = fakeAudioContext('first', 'running')
    const { audio } = handOverOf(first)
    audio.open()
    const canvas = { width: 240, height: 160 }
    const emulator = await loadEmulator(canvas as HTMLCanvasElement, audio)
    emulator.run(ROM)

    expect(mGBA).toHaveBeenCalledExactlyOnceWith({ canvas })
    expect(core.contextsAtLoad).toEqual([first])
  })
})
