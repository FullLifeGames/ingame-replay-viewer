import { describe, expect, it } from 'vitest'

import { messageOf } from './message'
import { SessionError } from './session'

describe('messageOf', () => {
  it('gives an Error by its message', () => {
    expect(messageOf(new TypeError('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('keeps a failed step in its own words', () => {
    const error = new SessionError('Could not fetch the patch: rom/irv-emerald.bps answered 404')
    expect(messageOf(error)).toBe('Could not fetch the patch: rom/irv-emerald.bps answered 404')
  })

  it('gives a thrown value that is not an Error by its text', () => {
    expect(messageOf('worker gone')).toBe('worker gone')
    expect(messageOf(404)).toBe('404')
    expect(messageOf(undefined)).toBe('undefined')
  })
})
