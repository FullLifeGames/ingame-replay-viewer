import { describe, expect, it } from 'vitest'

import { selfTimeLines } from './gen5-profile'

const node = (functionName: string, url: string, hitCount: number) => ({
  callFrame: { functionName, url },
  hitCount,
})

describe('selfTimeLines', () => {
  // The core's module comes from a Blob URL and has no names: its functions are wasm-function[N].
  it('splits the samples into wasm, JavaScript and the engine, then names the top functions', () => {
    const nodes = [
      node('(root)', '', 0),
      node('(idle)', '', 10),
      node('(program)', '', 5),
      node('(garbage collector)', '', 5),
      node('$func12', 'wasm://wasm/abc', 50),
      node('wasm-function[7]', 'blob:http://gen5.localhost/1234', 10),
      node('drawArrays', 'http://gen5.localhost/x.js', 20),
    ]
    expect(selfTimeLines(nodes, 2)).toEqual([
      'self time over 100 samples: wasm 60.0%, js 20.0%, idle 10.0%, program 5.0%, gc 5.0%',
      '  50.0% $func12 [wasm]',
      '  20.0% drawArrays [js]',
    ])
  })
})
