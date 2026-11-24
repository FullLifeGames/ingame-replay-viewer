import { describe, expect, it } from 'vitest'

import { isLocalRequest } from './gen5-shot'

describe('isLocalRequest', () => {
  const origin = 'http://gen5.localhost:5183'

  it('counts the page origin, blob: and data: URLs as local', () => {
    expect(isLocalRequest(`${origin}/emulatorjs/data/loader.js`, origin)).toBe(true)
    expect(isLocalRequest(`blob:${origin}/1234`, origin)).toBe(true)
    expect(isLocalRequest('data:text/plain,x', origin)).toBe(true)
  })

  it('counts the CDN and a look-alike host as leaving the machine', () => {
    expect(isLocalRequest('https://cdn.emulatorjs.org/stable/data/version.json', origin)).toBe(
      false,
    )
    expect(isLocalRequest('http://gen5.localhost:51830/x', origin)).toBe(false)
  })
})
