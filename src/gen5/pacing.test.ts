import { describe, expect, it } from 'vitest'

import { emulatorOptions, pageSettings, switchedQuery } from './pacing'

describe('pageSettings', () => {
  it('runs the plain core with vsync off when the address asks for nothing', () => {
    expect(pageSettings('')).toEqual({ threads: false, vsync: false })
  })

  it('reads ?threads=1 and ?vsync=1 from the address', () => {
    expect(pageSettings('?threads=1')).toEqual({ threads: true, vsync: false })
    expect(pageSettings('?vsync=1&threads=1')).toEqual({ threads: true, vsync: true })
    expect(pageSettings('?vsync=0&threads=yes')).toEqual({ threads: false, vsync: false })
  })
})

describe('emulatorOptions', () => {
  // EmulatorJS's own default is "enabled": the main loop waits for requestAnimationFrame.
  it("turns EmulatorJS's vsync setting off, so a frame never waits for the display", () => {
    expect(emulatorOptions({ threads: false, vsync: false })).toEqual({ vsync: 'disabled' })
  })

  it('leaves EmulatorJS at its own default with ?vsync=1', () => {
    expect(emulatorOptions({ threads: true, vsync: true })).toEqual({})
  })
})

describe('switchedQuery', () => {
  it('adds a switch that is off and keeps the other', () => {
    expect(switchedQuery('', 'threads')).toBe('?threads=1')
    expect(switchedQuery('?vsync=1', 'threads')).toBe('?vsync=1&threads=1')
  })

  it('drops a switch that is on', () => {
    expect(switchedQuery('?threads=1', 'threads')).toBe('')
    expect(switchedQuery('?threads=1&vsync=1', 'vsync')).toBe('?threads=1')
  })
})
