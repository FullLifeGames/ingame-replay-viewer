import { describe, expect, it } from 'vitest'

import { AudioOpener } from './audio-opener'
import { TickClock } from './clock'
import { pauseButton, soundForNewRun, spaceToggles, togglePause } from './pause'
import { CONTROL, createShared, readStatus, writeStatus } from './protocol'

const progress = { done: 3, total: 34, turn: 1, error: 0, finished: false, playing: true }

/** A run at `speed` that granted 59 frames in its first second; its game reports frame 40. */
function playing(speed: '1x' | 'fast' = '1x') {
  const clock = new TickClock(speed, 0)
  for (let now = 0; now <= 1000; now += 16) clock.allowed(now, 0)
  const control = new Int32Array(createShared(16).control)
  writeStatus(control, 40, progress)
  return {
    label: 'Gen 3: A vs B (hand-made)',
    clock,
    control,
    silence: undefined as string | undefined,
  }
}

/** A run whose game reached END: its interpreter reported finished at frame 2916. */
function ended() {
  const run = playing()
  writeStatus(run.control, 2916, { ...progress, done: 34, finished: true, playing: false })
  return run
}

/** A fake opener that logs its calls. */
function fakeAudio(log: string[]) {
  return {
    resumeNow: () => {
      log.push('resumeNow')
      return Promise.resolve(undefined)
    },
    suspend: () => {
      log.push('suspend')
      return Promise.resolve()
    },
  }
}

const press = (target: { tagName: string; isContentEditable?: boolean } | null, key = ' ') => ({
  key,
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  target: target && { isContentEditable: false, ...target },
})

describe('the pause button', () => {
  it('reads "Pause" and stays disabled before the first run', () => {
    expect(pauseButton(undefined)).toEqual({ label: 'Pause', disabled: true })
  })

  it('reads "Pause" while a run plays and "Play" while it stands paused', () => {
    const run = playing()
    expect(pauseButton(run)).toEqual({ label: 'Pause', disabled: false })
    run.clock.pause(40)
    expect(pauseButton(run)).toEqual({ label: 'Play', disabled: false })
    run.clock.play(2000)
    expect(pauseButton(run)).toEqual({ label: 'Pause', disabled: false })
  })

  // #57: a finished battle has nothing left to hold, so the button rests as before a run.
  it('reads "Pause" and stays disabled once the run reached END', () => {
    expect(pauseButton(ended())).toEqual({ label: 'Pause', disabled: true })
  })

  // Start or Restart during a pause begins a run with a clock of its own, which plays.
  it('reads "Pause" again for the run that Start began during a pause', () => {
    const paused = playing()
    paused.clock.pause(40)
    expect(pauseButton(paused).label).toBe('Play')
    expect(pauseButton(playing())).toEqual({ label: 'Pause', disabled: false })
  })
})

// A focused button fires its own click on Space, a radio checks itself, a summary opens and a
// link follows its own rule; the page acts only where Space has no use of its own.
describe('the Space key', () => {
  it.each(['BODY', 'CANVAS', 'body', 'P'])('toggles the pause on a %s target', (tagName) => {
    expect(spaceToggles(press({ tagName }), playing())).toBe(true)
  })

  it('toggles the pause with no target', () => {
    expect(spaceToggles(press(null), playing())).toBe(true)
  })

  it.each(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'TEXTAREA', 'input'])(
    'leaves Space alone on a target of the tag %s',
    (tagName) => {
      expect(spaceToggles(press({ tagName }), playing())).toBe(false)
    },
  )

  it('leaves an editable target alone', () => {
    expect(spaceToggles(press({ tagName: 'DIV', isContentEditable: true }), playing())).toBe(false)
  })

  it.each(['repeat', 'ctrlKey', 'altKey', 'metaKey'] as const)(
    'leaves a press with %s alone',
    (flag) => {
      expect(spaceToggles({ ...press({ tagName: 'BODY' }), [flag]: true }, playing())).toBe(false)
    },
  )

  // Before the first run there is nothing to pause, so Space scrolls the page as the browser does.
  it.each([{ tagName: 'BODY' }, null])(
    'leaves Space to the browser before the first run',
    (target) => {
      expect(spaceToggles(press(target), undefined)).toBe(false)
    },
  )

  it.each([{ tagName: 'BODY' }, null])(
    'leaves Space to the browser once the run reached END',
    (target) => {
      expect(spaceToggles(press(target), ended())).toBe(false)
    },
  )

  it('toggles a paused run too', () => {
    const run = playing()
    run.clock.pause(40)
    expect(spaceToggles(press({ tagName: 'BODY' }), run)).toBe(true)
  })

  it.each(['Enter', 'k', 'Spacebar', 'p'])('leaves the %s key alone', (key) => {
    expect(spaceToggles(press({ tagName: 'BODY' }, key), playing())).toBe(false)
  })
})

describe('the toggle', () => {
  it('holds a playing run at the frame its game reports and suspends the sound', () => {
    const log: string[] = []
    const run = playing()
    void togglePause(run, fakeAudio(log), 1500)
    expect(run.clock.paused).toBe(true)
    expect(readStatus(run.control).frame).toBe(40)
    expect(Atomics.load(run.control, CONTROL.allowed)).toBe(40)
    expect(Atomics.load(run.control, CONTROL.fast)).toBe(0)
    expect(log).toEqual(['suspend'])
  })

  it('resumes the sound first, then plays the run on from the frame of the pause', () => {
    const log: string[] = []
    const run = playing()
    void togglePause(run, fakeAudio(log), 1500)
    log.length = 0
    const audio = fakeAudio(log)
    const resumeNow = audio.resumeNow
    audio.resumeNow = () => {
      log.push(run.clock.paused ? 'paused' : 'playing')
      return resumeNow()
    }
    void togglePause(run, audio, 9000)
    expect(log).toEqual(['paused', 'resumeNow'])
    expect(run.clock.paused).toBe(false)
    expect(Atomics.load(run.control, CONTROL.allowed)).toBe(40)
    expect(run.clock.allowed(10_000, 41)).toBe(40 + 59)
  })

  it('lifts the limit again for a fast run that plays on', () => {
    const run = playing('fast')
    void togglePause(run, fakeAudio([]), 1500)
    expect(Atomics.load(run.control, CONTROL.allowed)).toBe(40)
    expect(Atomics.load(run.control, CONTROL.fast)).toBe(0)
    void togglePause(run, fakeAudio([]), 2000)
    expect(Atomics.load(run.control, CONTROL.fast)).toBe(1)
  })

  it('leaves a run that reached END as it is', async () => {
    const log: string[] = []
    const run = ended()
    const before = Atomics.load(run.control, CONTROL.allowed)
    await togglePause(run, fakeAudio(log), 1500)
    expect(run.clock.paused).toBe(false)
    expect(Atomics.load(run.control, CONTROL.allowed)).toBe(before)
    expect(log).toEqual([])
  })

  it('does nothing before the first run', async () => {
    const log: string[] = []
    await expect(togglePause(undefined, fakeAudio(log), 1500)).resolves.toBeUndefined()
    expect(log).toEqual([])
  })

  // S5-16: a refused suspend shows no line; the clock holds the game, and the next press asks again.
  it('gives no line for a refused suspend', async () => {
    const run = playing()
    const audio = { ...fakeAudio([]), suspend: () => Promise.reject(new Error('refused')) }
    await expect(togglePause(run, audio, 1500)).resolves.toBeUndefined()
    expect(run.clock.paused).toBe(true)
  })

  it('gives no line for a Play whose sound resumes', async () => {
    const run = playing()
    await togglePause(run, fakeAudio([]), 1500)
    await expect(togglePause(run, fakeAudio([]), 9000)).resolves.toBeUndefined()
  })

  // #69: an audio context whose resume() the browser refuses on Play. The game plays on without
  // sound, and the page shows the line that says why.
  it('plays the run on without sound when the browser refuses the resume, and gives the line', async () => {
    const context = {
      resume: () => Promise.resolve(),
      suspend: () => Promise.resolve(),
    }
    const audio = new AudioOpener(() => Promise.resolve(context as unknown as AudioContext))
    await audio.open()
    const run = playing()
    await togglePause(run, audio, 1500)
    context.resume = () => Promise.reject(new Error('refused for the test'))
    await expect(togglePause(run, audio, 9000)).resolves.toBe(
      'Running Gen 3: A vs B (hand-made). It plays without sound: the audio did not resume: refused for the test.',
    )
    expect(run.clock.paused).toBe(false)
    expect(run.clock.allowed(10_000, 41)).toBe(40 + 59)
  })

  // The tester's finding 2: after one refused Play, a Play whose resume succeeds gives the plain
  // running line back. A run that opened without sound keeps its own reason.
  it.each([
    [undefined, 'Running Gen 3: A vs B (hand-made).'],
    [
      'the audio worklet failed: no worklet',
      'Running Gen 3: A vs B (hand-made). It plays without sound: the audio worklet failed: no worklet.',
    ],
  ])(
    'gives the running line back once a Play resumes the sound (own reason %s)',
    async (silence, line) => {
      const context = { resume: () => Promise.resolve(), suspend: () => Promise.resolve() }
      const audio = new AudioOpener(() => Promise.resolve(context as unknown as AudioContext))
      await audio.open()
      const run = { ...playing(), silence }
      await togglePause(run, audio, 1500)
      context.resume = () => Promise.reject(new Error('refused for the test'))
      await togglePause(run, audio, 9000)
      context.resume = () => Promise.resolve()
      await expect(togglePause(run, audio, 9500)).resolves.toBeUndefined()
      await expect(togglePause(run, audio, 9800)).resolves.toBe(line)
      await togglePause(run, audio, 9900)
      await expect(togglePause(run, audio, 9950)).resolves.toBeUndefined()
    },
  )
})

// #57, M2 of the second review: a Pause pressed while a Start waited suspended the sound for the
// old run, and the new run plays.
describe('the sound of a new run', () => {
  it('asks the sound back for a run that plays', async () => {
    const log: string[] = []
    await soundForNewRun(playing(), fakeAudio(log))
    expect(log).toEqual(['resumeNow'])
  })

  it('leaves the sound alone for a run that stands paused', async () => {
    const log: string[] = []
    const run = playing()
    run.clock.pause(40)
    await soundForNewRun(run, fakeAudio(log))
    expect(log).toEqual([])
  })

  it('hands on the promise of the sound', async () => {
    const audio = { ...fakeAudio([]), resumeNow: () => Promise.reject(new Error('refused')) }
    await expect(soundForNewRun(playing(), audio)).rejects.toThrow('refused')
  })
})
