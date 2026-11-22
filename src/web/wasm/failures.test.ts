import { describe, expect, it } from 'vitest'

import { instantiateFailureLine, MODULE_MEMORY_BYTES } from './failures'

// The words each browser gives when it cannot reserve a module's fixed memory at instantiation.
const CHROMIUM =
  'WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance'
const FIREFOX = 'could not allocate memory'

describe('instantiateFailureLine', () => {
  it('says that the browser refused the memory, with the number, for each browser', () => {
    for (const words of [CHROMIUM, FIREFOX]) {
      const line = instantiateFailureLine(new RangeError(words))
      expect(line).toContain('This browser did not give the game the 256 MB of memory it needs')
      expect(line).toContain(words)
      expect(line).not.toContain('did not instantiate')
    }
  })

  it('reads the words when the error is no RangeError', () => {
    for (const words of [CHROMIUM, FIREFOX]) {
      expect(instantiateFailureLine(new Error(words))).toContain('256 MB of memory')
    }
  })

  it('takes any RangeError of the instantiation as a refused memory', () => {
    expect(instantiateFailureLine(new RangeError('Out of memory'))).toContain('256 MB of memory')
  })

  // Each Start makes a new worker that instantiates the module again, so the dump stays picked.
  it('names the remedy a phone has', () => {
    expect(instantiateFailureLine(new RangeError(CHROMIUM))).toContain(
      'Close other tabs or apps, then press Start again.',
    )
  })

  it('keeps the present line for any other error', () => {
    const link = new WebAssembly.LinkError('import object field "irvFrame" is not a Function')
    expect(instantiateFailureLine(link)).toBe(
      'The module did not instantiate: import object field "irvFrame" is not a Function',
    )
    expect(instantiateFailureLine('a thrown string')).toBe(
      'The module did not instantiate: a thrown string',
    )
  })

  // A link error about the memory's import is a build mismatch, not a refusal.
  it('keeps the present line for an error that names memory but no allocation', () => {
    const link = new WebAssembly.LinkError('memory import must be a WebAssembly.Memory object')
    expect(instantiateFailureLine(link)).toContain('The module did not instantiate')
  })

  it('counts the memory in bytes as the link gives it', () => {
    expect(MODULE_MEMORY_BYTES).toBe(256 * 1024 * 1024)
  })
})
