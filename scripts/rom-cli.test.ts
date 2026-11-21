import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorText, runCliAsync } from './rom-cli.ts'

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

describe('an async rom:* command', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('writes the error text and sets exit code 1 when its run rejects', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await runCliAsync('rom:shots', () => Promise.reject(new Error('no ROM')))
    expect(write).toHaveBeenCalledWith('rom:shots: no ROM\n')
    expect(process.exitCode).toBe(1)
  })

  it('leaves the exit code alone when its run resolves', async () => {
    await runCliAsync('rom:shots', () => Promise.resolve())
    expect(process.exitCode).toBeUndefined()
  })
})
