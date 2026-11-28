import { describe, expect, it } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import { NOT_STARTED_LINE } from './emulator'
import type { TestReplay } from './replays'
import { ROM_FILES } from './rom-files'
import { SessionError } from './replay-choice'
import {
  BASE,
  DESCRIPTION,
  OTHER_DUMP,
  ready,
  REPLAY_994052,
  REPLAY_994086,
  slotStream,
  STREAM_994052,
  TARGET,
  world,
} from './session-testing'
import { notShownCounts } from './not-shown-list'
import { notShown, streamOfReplay } from './stream'

describe('a session on a fresh page', () => {
  it('asks for the dump when Start comes first', async () => {
    const { session, runs } = world()
    await session.pickTestReplay(REPLAY_994052)
    await expect(session.start()).rejects.toThrow(
      new SessionError('Pick your US Emerald dump first, then press Start.'),
    )
    expect(runs).toHaveLength(0)
  })

  it('asks for a replay when the dump is all it has', async () => {
    const { session } = world()
    await session.pickDump(BASE)
    await expect(session.start()).rejects.toThrow(
      new SessionError('Pick a replay first, then press Start.'),
    )
  })

  it('refuses Restart before any Start with the emulator line', () => {
    const { session, log } = world()
    expect(() => {
      session.restart()
    }).toThrow(new SessionError(`Could not restart: ${NOT_STARTED_LINE}`))
    expect(log.loads).toBe(0)
  })
})

describe('the full flow', () => {
  it('runs the patched ROM with 994052 in its slot', async () => {
    const { session, runs } = world()
    expect(await session.pickDump(BASE)).toEqual({ romSha1: DESCRIPTION.romSha1 })
    await session.pickTestReplay(REPLAY_994052)
    expect(await session.start()).toEqual({
      id: 'smogtours-gen3ou-994052',
      label: 'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)',
    })
    expect(runs).toHaveLength(1)
    const [run = new Uint8Array()] = runs
    expect(slotStream(run)).toEqual(STREAM_994052)
    expect(run.subarray(0, DESCRIPTION.lengthOffset)).toEqual(
      TARGET.subarray(0, DESCRIPTION.lengthOffset),
    )
    expect(run.subarray(DESCRIPTION.streamOffset + STREAM_994052.length)).toEqual(
      TARGET.subarray(DESCRIPTION.streamOffset + STREAM_994052.length),
    )
  })

  it("gives a replay's stream size and what the game does not show", async () => {
    const { session } = world()
    const { replay, stream, players } = streamOfReplay(replay994052)
    const rows = notShown(replay, stream)
    expect(await session.pickTestReplay(REPLAY_994052)).toEqual({
      id: 'smogtours-gen3ou-994052',
      label: 'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)',
      streamBytes: stream.bytes.length,
      instructions: stream.instructions.length,
      rows,
      counts: notShownCounts(rows),
      players,
    })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('fetches the patch and replay-slot.json once for every dump', async () => {
    const { session, fetched } = world()
    await session.pickDump(BASE)
    await session.pickDump(BASE)
    expect(fetched.toSorted()).toEqual([ROM_FILES.patch, ROM_FILES.slot])
  })

  it('loads the emulator once and hands the crash line to the page', async () => {
    const { session, log, crashLines, crashNow } = world()
    await ready(session)
    await session.start()
    await session.start()
    expect(log.loads).toBe(1)
    crashNow('The emulator crashed. Press Start to run the replay again.')
    expect(crashLines).toEqual(['The emulator crashed. Press Start to run the replay again.'])
  })

  it('restarts the running game', async () => {
    const { session, log, runs } = world()
    await ready(session)
    await session.start()
    session.restart()
    expect(log.restarts).toBe(1)
    expect(runs).toHaveLength(1)
  })
})

describe('a new pick after Start', () => {
  it('writes a new replay at the next Start, and Restart keeps the running one', async () => {
    const { session, runs, log } = world()
    await ready(session)
    await session.start()
    await session.pickTestReplay(REPLAY_994086)
    session.restart()
    expect([runs.length, log.restarts]).toEqual([1, 1])
    expect((await session.start()).id).toBe('smogtours-gen3ou-994086')
    const expected = streamOfReplay(await REPLAY_994086.load()).stream.bytes
    expect(slotStream(runs[1] ?? new Uint8Array())).toEqual(expected)
  })

  it('refuses Start after the newest dump was refused, and keeps the running game', async () => {
    const { session, runs, log } = world()
    await ready(session)
    await session.start()
    await expect(session.pickDump(OTHER_DUMP)).rejects.toThrow(SessionError)
    await expect(session.start()).rejects.toThrow(
      /^Could not patch your dump: This file is not the US Emerald dump/,
    )
    session.restart()
    expect([runs.length, log.restarts]).toEqual([1, 1])
  })

  it('takes the newest dump when two picks overlap', async () => {
    const { session, runs } = world()
    await session.pickTestReplay(REPLAY_994052)
    const first = session.pickDump(BASE)
    const second = session.pickDump(OTHER_DUMP).catch((error: unknown) => error)
    expect(await first).toBeUndefined()
    expect(await second).toBeInstanceOf(SessionError)
    await expect(session.start()).rejects.toThrow(/^Could not patch your dump: /)
    expect(runs).toHaveLength(0)
  })

  it('takes the newest replay when two picks overlap', async () => {
    const { session } = world()
    await session.pickDump(BASE)
    const first = session.loadReplay('smogtours-gen3ou-994176')
    const second = session.pickTestReplay(REPLAY_994052)
    expect(await first).toBeUndefined()
    expect((await second)?.id).toBe('smogtours-gen3ou-994052')
    expect((await session.start()).id).toBe('smogtours-gen3ou-994052')
  })

  it('drops a refusal of a pick that a newer pick replaced', async () => {
    const { session } = world()
    const first = session.pickDump(OTHER_DUMP)
    const second = session.pickDump(BASE)
    expect(await first).toBeUndefined()
    expect(await second).toEqual({ romSha1: DESCRIPTION.romSha1 })
  })
})

describe('a replay pick that fails', () => {
  it('leaves the earlier pick for the next Start', async () => {
    const { session, runs } = world()
    await session.pickDump(BASE)
    await session.pickTestReplay(REPLAY_994086)
    await expect(session.loadReplay('xz abc')).rejects.toThrow(/^Could not read the replay link: /)
    expect((await session.start()).id).toBe('smogtours-gen3ou-994086')
    expect(runs).toHaveLength(1)
  })

  it('leaves the earlier pick for a Start that waits on the failing one', async () => {
    const { session } = world()
    await ready(session)
    let fail: (error: Error) => void = () => undefined
    const broken: TestReplay = {
      id: 'broken',
      load: () => new Promise((_, reject) => (fail = reject)),
    }
    const failing = session.pickTestReplay(broken).catch((error: unknown) => error)
    const started = session.start()
    fail(new Error('chunk gone'))
    expect(await failing).toBeInstanceOf(SessionError)
    expect((await started).id).toBe('smogtours-gen3ou-994052')
  })

  it('counts for nothing when it fails after a newer pick', async () => {
    const { session } = world()
    await session.pickDump(BASE)
    let fail: (error: Error) => void = () => undefined
    const broken: TestReplay = {
      id: 'broken',
      load: () => new Promise((_, reject) => (fail = reject)),
    }
    const failing = session.pickTestReplay(broken)
    expect((await session.pickTestReplay(REPLAY_994086))?.id).toBe('smogtours-gen3ou-994086')
    fail(new Error('chunk gone'))
    expect(await failing).toBeUndefined()
    expect((await session.start()).id).toBe('smogtours-gen3ou-994086')
  })

  it('asks for a replay when no earlier pick is left', async () => {
    const { session } = world()
    await session.pickDump(BASE)
    await expect(session.loadReplay('xz abc')).rejects.toThrow(SessionError)
    await expect(session.start()).rejects.toThrow(
      new SessionError('Pick a replay first, then press Start.'),
    )
  })
})
