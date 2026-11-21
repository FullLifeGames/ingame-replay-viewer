import { describe, expect, it } from 'vitest'

import { readReplay, ReplayError } from './replay'

const files = import.meta.glob('../../test/fixtures/replays/*.json', {
  eager: true,
  import: 'default',
})

function fixture(id: string): unknown {
  return files[`../../test/fixtures/replays/${id}.json`]
}

describe('readReplay', () => {
  it('reads a saved tournament replay', () => {
    const replay = readReplay(fixture('smogtours-gen3ou-994052'))

    expect(replay.id).toBe('smogtours-gen3ou-994052')
    expect(replay.formatid).toBe('gen3ou')
    expect(replay.players).toHaveLength(2)
    expect(replay.log.split('\n')).toContain('|start')
  })

  it('refuses a replay JSON without a log', () => {
    expect(() => readReplay({ id: 'x' })).toThrow(ReplayError)
    expect(() => readReplay({ id: 'x' })).toThrow(/"log"/)
  })

  it('refuses a field of the wrong type', () => {
    const json = { id: 'x', format: 'f', formatid: 'f', players: ['a', 2], log: '' }

    expect(() => readReplay(json)).toThrow(/"players"/)
  })

  it('refuses JSON that is not an object', () => {
    expect(() => readReplay(null)).toThrow(ReplayError)
    expect(() => readReplay(['|start'])).toThrow(ReplayError)
  })
})
