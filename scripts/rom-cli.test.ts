import { describe, expect, it } from 'vitest'

import { errorText } from './rom-cli.ts'

describe('the error text of a rom:* command', () => {
  it('gives the message and the cause on lines of their own', () => {
    const error = new Error('tree stays as it is', { cause: new Error('HEAD is not the pin') })
    expect(errorText('rom:build', error)).toBe(
      'rom:build: tree stays as it is\nHEAD is not the pin\n',
    )
  })

  it('gives the message alone without a cause', () => {
    expect(errorText('rom:repro', new Error('make failed'))).toBe('rom:repro: make failed\n')
  })

  it('writes out a thrown value that is no Error', () => {
    expect(errorText('rom:build', 'odd')).toBe('rom:build: odd\n')
  })
})
