import { describe, expect, it } from 'vitest'

import { TickClock } from './clock'
import { pauseButton, spaceToggles, togglePause } from './pause'
import { CONTROL, createShared, readStatus, writeStatus } from './protocol'

const progress = { done: 3, total: 34, turn: 1, error: 0, finished: false, playing: true }

/** A run at `speed` that granted 59 frames in its first second; its game reports frame 40. */
function playing(speed: '1x' | 'fast' = '1x') {
  const clock = new TickClock(speed, 0)
  for (let now = 0; now <= 1000; now += 16) clock.allowed(now, 0)
  const control = new Int32Array(createShared(16).control)
  writeStatus(control, 40, progress)
  return { clock, control }
}

/** A fake opener that logs its calls. */
function fakeAudio(log: string[]) {
  return {
    resumeNow: () => {
      log.push('resumeNow')
      return Promise.resolve()
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
    expect(spaceToggles(press({ tagName }))).toBe(true)
  })

  it('toggles the pause with no target', () => {
    expect(spaceToggles(press(null))).toBe(true)
  })

  it.each(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'TEXTAREA', 'input'])(
    'leaves Space alone on a target of the tag %s',
    (tagName) => {
      expect(spaceToggles(press({ tagName }))).toBe(false)
    },
  )

  it('leaves an editable target alone', () => {
    expect(spaceToggles(press({ tagName: 'DIV', isContentEditable: true }))).toBe(false)
  })

  it.each(['repeat', 'ctrlKey', 'altKey', 'metaKey'] as const)(
    'leaves a press with %s alone',
    (flag) => {
      expect(spaceToggles({ ...press({ tagName: 'BODY' }), [flag]: true })).toBe(false)
    },
  )

  it.each(['Enter', 'k', 'Spacebar', 'p'])('leaves the %s key alone', (key) => {
    expect(spaceToggles(press({ tagName: 'BODY' }, key))).toBe(false)
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

  it('does nothing before the first run', async () => {
    const log: string[] = []
    await expect(togglePause(undefined, fakeAudio(log), 1500)).resolves.toBeUndefined()
    expect(log).toEqual([])
  })

  it('hands on the promise of the sound', async () => {
    const run = playing()
    const audio = { ...fakeAudio([]), suspend: () => Promise.reject(new Error('refused')) }
    await expect(togglePause(run, audio, 1500)).rejects.toThrow('refused')
  })
})
