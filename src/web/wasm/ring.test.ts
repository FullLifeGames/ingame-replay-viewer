import { describe, expect, it } from 'vitest'

import { createShared } from './protocol'
import { AudioRing } from './ring'

describe('the audio ring', () => {
  it('wraps around its end and hands the samples out in order', () => {
    const ring = new AudioRing(createShared(4).audio)
    expect(ring.push(Float32Array.of(1, 2, 3))).toBe(0)
    const out = new Float32Array(4)
    expect(ring.pull(out.subarray(0, 2))).toBe(2)
    expect(ring.push(Float32Array.of(4, 5, 6))).toBe(0)
    expect(ring.pull(out)).toBe(4)
    expect([...out]).toEqual([3, 4, 5, 6])
    expect(ring.pull(out)).toBe(0)
    expect(ring.overruns).toBe(0)
  })

  it('drops what does not fit and reports an overrun', () => {
    const ring = new AudioRing(createShared(4).audio)
    expect(ring.push(Float32Array.of(1, 2, 3))).toBe(0)
    expect(ring.push(Float32Array.of(4, 5, 6))).toBe(2)
    expect(ring.overruns).toBe(1)
    const out = new Float32Array(4)
    expect(ring.pull(out)).toBe(4)
    expect([...out]).toEqual([1, 2, 3, 4])
  })

  it('counts what went in and out, and shows the newest samples without reading them', () => {
    const ring = new AudioRing(createShared(4).audio)
    ring.push(Float32Array.of(1, 2, 3))
    ring.pull(new Float32Array(2))
    ring.push(Float32Array.of(4, 5))
    expect([ring.totalWritten, ring.totalRead]).toEqual([5, 2])
    const out = new Float32Array(3)
    expect(ring.recent(out)).toBe(3)
    expect([...out]).toEqual([3, 4, 5])
    expect(ring.totalRead).toBe(2)
    expect(ring.recent(new Float32Array(9))).toBe(4)
  })

  it('refuses a capacity that is not a positive whole number', () => {
    expect(() => createShared(0)).toThrow(
      'the audio ring needs a capacity of 1 or more samples, not 0',
    )
  })
})
