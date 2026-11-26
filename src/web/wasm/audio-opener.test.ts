import { describe, expect, it } from 'vitest'

import { AudioOpener, silenceOf } from './audio-opener'

/** A fake audio context that logs its calls; `refuse` makes its resume reject with that reason. */
function fakeContext(log: string[], refuse?: string): AudioContext {
  const context = {
    resume: () => {
      log.push('resume')
      return refuse === undefined ? Promise.resolve() : Promise.reject(new Error(refuse))
    },
    suspend: () => {
      log.push('suspend')
      return Promise.resolve()
    },
  }
  return context as unknown as AudioContext
}

/** An opener whose factory logs each call and hands out `context`, or fails with `refuse`. */
function opener(log: string[], context: AudioContext | string): AudioOpener {
  return new AudioOpener(() => {
    log.push('create')
    return typeof context === 'string'
      ? Promise.reject(new Error(context))
      : Promise.resolve(context)
  })
}

// A phone browser may refuse resume() unless it runs inside the click, before any await (#57).
describe('the audio opener', () => {
  it('opens the context once, resumes it and hands it on', async () => {
    const log: string[] = []
    const context = fakeContext(log)
    const audio = opener(log, context)
    const [first, second] = await Promise.all([audio.open(), audio.open()])
    expect(first).toBe(context)
    expect(second).toBe(context)
    expect(log.filter((call) => call === 'create')).toEqual(['create'])
  })

  it('resumes an open context before open() returns, with no microtask between', async () => {
    const log: string[] = []
    const context = fakeContext(log)
    const audio = opener(log, context)
    await audio.open()
    log.length = 0
    const opened = audio.open()
    expect(log).toEqual(['resume'])
    await expect(opened).resolves.toBe(context)
  })

  it('resumes an open context before resumeNow() returns', async () => {
    const log: string[] = []
    const audio = opener(log, fakeContext(log))
    await audio.open()
    log.length = 0
    const resumed = audio.resumeNow()
    expect(log).toEqual(['resume'])
    await expect(resumed).resolves.toBeUndefined()
  })

  it('suspends an open context', async () => {
    const log: string[] = []
    const audio = opener(log, fakeContext(log))
    await audio.open()
    log.length = 0
    await audio.suspend()
    expect(log).toEqual(['suspend'])
  })

  it('does nothing on resumeNow() and suspend() before the context is open', async () => {
    const log: string[] = []
    const audio = opener(log, fakeContext(log))
    await expect(audio.resumeNow()).resolves.toBeUndefined()
    await expect(audio.suspend()).resolves.toBeUndefined()
    expect(log).toEqual([])
  })

  it('says why the page could not open its audio, and asks the factory again', async () => {
    const log: string[] = []
    const audio = opener(log, 'no audio device')
    const silence = { reason: 'the page could not open its audio', words: 'no audio device' }
    await expect(audio.open()).resolves.toEqual(silence)
    await expect(audio.open()).resolves.toEqual(silence)
    expect(log).toEqual(['create', 'create'])
  })

  it('says why the audio did not start, and resumes again on the next open()', async () => {
    const log: string[] = []
    const audio = opener(log, fakeContext(log, 'refused for the test'))
    const silence = { reason: 'the audio did not start', words: 'refused for the test' }
    await expect(audio.open()).resolves.toEqual(silence)
    log.length = 0
    const again = audio.open()
    expect(log).toEqual(['resume'])
    await expect(again).resolves.toEqual(silence)
  })

  // #69: Play's resume that the browser refuses shows a line, and the game plays on without sound.
  it('says why the sound stays off when the browser refuses a later resume', async () => {
    const log: string[] = []
    const context = fakeContext(log)
    const audio = opener(log, context)
    await audio.open()
    context.resume = () => Promise.reject(new Error('refused for the test'))
    await expect(audio.resumeNow()).resolves.toEqual({
      reason: 'the audio did not resume',
      words: 'refused for the test',
    })
  })

  // #90: the status line says the reason; the browser's own words wait under "Details".
  it("keeps our reason apart from the browser's words", () => {
    expect(silenceOf('the audio did not start', new Error('refused for the test'))).toEqual({
      reason: 'the audio did not start',
      words: 'refused for the test',
    })
    expect(silenceOf('the audio did not start', 'no device')).toEqual({
      reason: 'the audio did not start',
      words: 'no device',
    })
  })
})
