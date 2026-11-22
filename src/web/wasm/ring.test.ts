import { describe, expect, it } from 'vitest'

import { createShared } from './protocol'
import { AudioRing, trimFloor } from './ring'

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

  it('counts what went in, out and waits, and shows the newest samples without reading them', () => {
    const ring = new AudioRing(createShared(4).audio)
    ring.push(Float32Array.of(1, 2, 3))
    ring.pull(new Float32Array(2))
    ring.push(Float32Array.of(4, 5))
    expect([ring.totalWritten, ring.totalRead, ring.waiting]).toEqual([5, 2, 3])
    const out = new Float32Array(3)
    expect(ring.recent(out)).toBe(3)
    expect([...out]).toEqual([3, 4, 5])
    expect(ring.totalRead).toBe(2)
    expect(ring.recent(new Float32Array(9))).toBe(4)
  })

  // At 84,096 samples per second the counters pass 2^31 after about 7 hours of one run.
  it('keeps the samples in order when its counters pass 2^31', () => {
    const shared = createShared(8)
    // The header starts with the samples written and read: the state after 2^31 - 2 of each.
    new Int32Array(shared.audio, 0, 2).fill(2 ** 31 - 2)
    const ring = new AudioRing(shared.audio)
    expect(ring.push(Float32Array.of(1, 2, 3, 4, 5, 6))).toBe(0)
    expect(ring.push(Float32Array.of(7, 8, 9))).toBe(1)
    expect(ring.waiting).toBe(8)
    const out = new Float32Array(8)
    expect(ring.pull(out)).toBe(8)
    expect([...out]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([ring.totalWritten, ring.totalRead]).toEqual([2 ** 31 + 6, 2 ** 31 + 6])
    const recent = new Float32Array(2)
    expect(ring.recent(recent)).toBe(2)
    expect([...recent]).toEqual([7, 8])
  })

  // A power of two keeps left and right pairs whole and lets the counters wrap at 2^32.
  it('refuses a capacity that is not a power of two from 2 on', () => {
    for (const capacity of [0, 1, 3, 6, 2.5]) {
      expect(() => createShared(capacity)).toThrow(
        `the audio ring needs a power of two from 2 on as its capacity, not ${String(capacity)}`,
      )
    }
  })

  // The latency cap: the reader holds what waits at or under a limit, so a writer that runs a
  // little faster than the audio clock cannot fill the ring.
  it('skips the oldest samples down to half the cap when more waits, and counts them', () => {
    const ring = new AudioRing(createShared(16).audio)
    ring.push(Float32Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))
    expect(ring.trim(8)).toBe(6)
    expect(ring.skipped).toBe(6)
    const out = new Float32Array(8)
    expect(ring.pull(out)).toBe(4)
    expect([...out.subarray(0, 4)]).toEqual([7, 8, 9, 10])
    ring.push(Float32Array.of(11, 12, 13, 14))
    expect(ring.trim(8)).toBe(0)
    expect(ring.skipped).toBe(6)
  })

  it('skips whole left and right pairs only', () => {
    const ring = new AudioRing(createShared(16).audio)
    ring.push(new Float32Array(12))
    expect(ring.trim(10)).toBe(8)
  })

  it('names what a trim leaves: half the cap, in whole pairs', () => {
    expect(trimFloor(8)).toBe(4)
    expect(trimFloor(10)).toBe(4)
    const ring = new AudioRing(createShared(16).audio)
    ring.push(new Float32Array(12))
    ring.trim(10)
    expect(ring.waiting).toBe(trimFloor(10))
  })

  it('counts the dry spells the reader found', () => {
    const ring = new AudioRing(createShared(4).audio)
    ring.countUnderruns(3)
    ring.countUnderruns(0)
    expect(ring.underruns).toBe(3)
  })
})
