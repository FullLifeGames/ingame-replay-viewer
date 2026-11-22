import { describe, expect, it } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import replay994176 from '../../test/fixtures/replays/smogtours-gen3ou-994176.json'
import { createReplayChoice, newest, SessionError, step } from './replay-choice'
import { REPLAY_994052, REPLAY_994086, SHOWDOWN_994176, STREAM_994052 } from './session-testing'
import { notShown, notShownCounts, streamOfReplay } from './stream'

/** A promise and the calls that settle it, for picks that overlap. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Showdown as a fake that answers 994176 and logs each URL it was asked for. */
function showdown() {
  const fetched: string[] = []
  const fetchJson = (url: string): Promise<unknown> => {
    fetched.push(url)
    return url === SHOWDOWN_994176
      ? Promise.resolve(replay994176)
      : Promise.reject(new Error(`${url} answered 404`))
  }
  return { fetched, choice: createReplayChoice(fetchJson) }
}

describe('a replay choice', () => {
  it('describes a test replay by the stream that Start plays', async () => {
    const { choice } = showdown()
    const summary = await choice.pickTestReplay(REPLAY_994052)
    const { replay, stream } = streamOfReplay(replay994052)
    const rows = notShown(replay, stream)
    expect(summary).toEqual({
      id: 'smogtours-gen3ou-994052',
      streamBytes: STREAM_994052.length,
      instructions: stream.instructions.length,
      rows,
      counts: notShownCounts(rows),
    })
    const chosen = await choice.chosen()
    expect(chosen?.bytes).toEqual(STREAM_994052)
    expect(chosen?.summary).toEqual(summary)
  })

  it('loads a replay by its link from Showdown only', async () => {
    const { choice, fetched } = showdown()
    const summary = await choice.loadReplay(
      'https://replay.pokemonshowdown.com/smogtours-gen3ou-994176',
    )
    expect(summary?.id).toBe('smogtours-gen3ou-994176')
    expect((await choice.chosen())?.summary).toBe(summary)
    expect(fetched).toEqual([SHOWDOWN_994176])
  })

  it('has no replay before the first pick', async () => {
    expect(await showdown().choice.chosen()).toBeUndefined()
  })

  it('keeps the earlier replay when a load fails, and names the step', async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    await expect(choice.loadReplay('gen3ou-1')).rejects.toThrow(
      new SessionError(
        'Could not fetch the replay: https://replay.pokemonshowdown.com/gen3ou-1.json answered 404',
      ),
    )
    expect((await choice.chosen())?.summary.id).toBe('smogtours-gen3ou-994086')
  })
})

describe('the newest pick', () => {
  it('counts for nothing once a newer pick replaced it, even when it settles later', async () => {
    const picks = newest<string>(false)
    const older = deferred<string>()
    const first = picks.pick(older.promise)
    const second = picks.pick(Promise.resolve('newer'))
    older.resolve('older')
    expect(await first).toBeUndefined()
    expect(await second).toBe('newer')
    expect(await picks.get()).toBe('newer')
  })

  it('drops the refusal of a pick that a newer pick replaced', async () => {
    const picks = newest<string>(false)
    const older = deferred<string>()
    const first = picks.pick(older.promise)
    void picks.pick(Promise.resolve('newer'))
    older.reject(new Error('refused'))
    expect(await first).toBeUndefined()
  })

  it('hands on the pick before a failed one only when it keeps the earlier', async () => {
    const kept = newest<string>(true)
    await kept.pick(Promise.resolve('earlier'))
    await expect(kept.pick(Promise.reject(new Error('refused')))).rejects.toThrow('refused')
    expect(await kept.get()).toBe('earlier')

    const dropped = newest<string>(false)
    await dropped.pick(Promise.resolve('earlier'))
    const failing = dropped.pick(Promise.reject(new Error('refused')))
    await expect(failing).rejects.toThrow('refused')
    await expect(dropped.get()).rejects.toThrow('refused')
  })
})

describe('a step', () => {
  it("names the step, keeps the module's words and the cause", async () => {
    const cause = new Error('chunk gone')
    const failure = await step('Could not load', () => Promise.reject(cause)).catch(
      (error: unknown) => error,
    )
    expect(failure).toEqual(new SessionError('Could not load: chunk gone'))
    expect((failure as SessionError).cause).toBe(cause)
  })

  it('hands back the work of a step that succeeds', async () => {
    expect(await step('Could not count', () => 3)).toBe(3)
  })
})
