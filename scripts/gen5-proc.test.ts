import { describe, expect, it } from 'vitest'

import { descendants, kbField, loadAverage, parentOf, sampleMemory } from './gen5-proc'

describe('parentOf', () => {
  it('reads the parent PID past a command name with spaces and parentheses', () => {
    expect(parentOf('4242 (Chrome (renderer) x) S 4100 4242 4242 0 -1')).toBe(4100)
  })
})

describe('kbField', () => {
  it('reads a kB field and gives 0 for a missing one', () => {
    const status = 'Name:\tchrome\nVmRSS:\t  123456 kB\nThreads:\t9\n'
    expect(kbField(status, 'VmRSS')).toBe(123456)
    expect(kbField(status, 'Pss')).toBe(0)
  })
})

describe('sampleMemory', () => {
  it('finds no descendants of a PID that has none and sums to zero', () => {
    expect(descendants(2 ** 22 + 1)).toEqual([])
    expect(sampleMemory(2 ** 22 + 1)).toEqual({
      processes: 0,
      rssMb: 0,
      pssMb: 0,
      largestRssMb: 0,
    })
  })
})

describe('loadAverage', () => {
  it('keeps the 1, 5 and 15 minute figures of /proc/loadavg', () => {
    expect(loadAverage('6.12 7.40 6.98 3/1234 56789\n')).toBe('6.12 7.40 6.98')
  })
})
