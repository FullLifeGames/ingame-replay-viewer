import { describe, expect, it, vi } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import replay994176 from '../../test/fixtures/replays/smogtours-gen3ou-994176.json'
import { PLAYED_GENS_TEXT } from '../gen3/backend'
import { readReplay } from '../script/replay'
import { downloadedFile, jsonFile, rawLog, replayPage } from '../script/saved-replay-testing'
import {
  createReplayChoice,
  FileSizeError,
  LARGEST_FILE,
  newest,
  type SavedFile,
  SessionError,
  step,
} from './replay-choice'
import { reportLink } from './report-link'
import { REPLAY_994052, REPLAY_994086, SHOWDOWN_994176, STREAM_994052 } from './session-testing'
import { notShownCounts } from './not-shown-list'
import { notShown, streamOfReplay } from './stream'

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
      label: 'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)',
      streamBytes: STREAM_994052.length,
      instructions: stream.instructions.length,
      rows,
      counts: notShownCounts(rows),
      players: { near: 'A Welcome Guest', far: 'xXEricXx' },
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

  // S5-11 (c): a run's failure reports the place of the pick it plays, never a name of its own.
  it('hands Start the place each pick came from', async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    expect((await choice.chosen())?.place).toEqual({
      source: 'example',
      replay: 'smogtours-gen3ou-994086',
    })
    await choice.loadReplay('smogtours-gen3ou-994176')
    expect((await choice.chosen())?.place).toEqual({
      source: 'link',
      replay: 'smogtours-gen3ou-994176',
    })
    await choice.loadFile(savedFile('Jane Doe vs. Rival.log', rawLog(REPLAY)).file)
    expect((await choice.chosen())?.place).toEqual({ source: 'file', replay: 'a battle log' })
  })

  // #59: a phone keyboard adds a space after a pasted link, and the report is public.
  it.each([' ', '\n', '\t', '\u00a0'])(
    'reports a link typed with %j after it as the trimmed link, without its password',
    async (space) => {
      const { choice } = showdown()
      const link = `https://replay.pokemonshowdown.com/gen3ou-1-${'a1'.repeat(15)}apw`
      const error: unknown = await choice.loadReplay(`${link}${space}`).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(SessionError)
      expect((error as SessionError).replay).toBe(link)
      const report = reportLink({ replay: (error as SessionError).replay, line: 'A line.' })
      const cut = encodeURIComponent('https://replay.pokemonshowdown.com/gen3ou-1')
      expect(report).toContain(`&replay=${cut}&line=`)
    },
  )

  it('has no replay before the first pick', async () => {
    expect(await showdown().choice.chosen()).toBeUndefined()
  })

  it('keeps the earlier replay when a load fails, and names the step', async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    await expect(choice.loadReplay('gen3ou-1')).rejects.toThrow(
      new SessionError(
        'Could not fetch the replay: https://replay.pokemonshowdown.com/gen3ou-1.json answered 404',
        undefined,
        { source: 'link', replay: 'gen3ou-1' },
      ),
    )
    expect((await choice.chosen())?.summary.id).toBe('smogtours-gen3ou-994086')
  })
})

/** A file as the page's file input hands it on, with a spy on its `text`. */
function savedFile(
  name: string,
  text: string | Promise<string>,
  size = typeof text === 'string' ? text.length : 0,
) {
  const read = vi.fn(() => Promise.resolve(text))
  const file: SavedFile = { name, size, text: read }
  return { file, read }
}

const REPLAY = readReplay(replay994052)
const SHAPES = [
  ['downloaded file', 'Gen 3 OU replay.html', downloadedFile(REPLAY)],
  ['saved replay page', 'Replays.html', replayPage(REPLAY)],
  ['battle log', 'smogtours-gen3ou-994052.log', rawLog(REPLAY)],
  ['JSON file', 'replay.json', jsonFile(REPLAY)],
] as const

describe('a replay file', () => {
  it.each(SHAPES)('plays a %s as the stream of its JSON, byte for byte', async (_, name, text) => {
    const { choice } = showdown()
    const summary = await choice.loadFile(savedFile(name, text).file)
    expect(summary).toEqual(await showdown().choice.pickTestReplay(REPLAY_994052))
    expect((await choice.chosen())?.bytes).toEqual(STREAM_994052)
  })

  it.each(SHAPES)('names the players of a %s from its battle log', async (_, name, text) => {
    const summary = await showdown().choice.loadFile(savedFile(name, text).file)
    expect(summary?.players).toEqual({ near: 'A Welcome Guest', far: 'xXEricXx' })
  })

  it('keeps the earlier replay when a file holds no replay, and names the step', async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    await expect(choice.loadFile(savedFile('notes.txt', 'hello').file)).rejects.toThrow(
      /^Could not read the replay file notes\.txt: the file holds no replay the viewer reads: /,
    )
    expect((await choice.chosen())?.summary.id).toBe('smogtours-gen3ou-994086')
  })

  it('keeps the earlier replay when a file gives no stream', async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    const gen8 = rawLog({ ...REPLAY, log: REPLAY.log.replace('|gen|3\n', '|gen|8\n') })
    const failure = choice.loadFile(savedFile('gen8.log', gen8).file)
    await expect(failure).rejects.toThrow(SessionError)
    await expect(failure).rejects.toThrow(
      `Could not turn the replay into a stream: the stream plays ${PLAYED_GENS_TEXT} battles, this one is Gen 8`,
    )
    expect((await choice.chosen())?.summary.id).toBe('smogtours-gen3ou-994086')
  })

  it("leaves Start on the page's replay, not on a file still being read, when a newer file fails", async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    const slow = deferred<string>()
    const reading = choice.loadFile(savedFile('slow.log', slow.promise, 100).file)
    await expect(choice.loadFile(savedFile('empty.log', '').file)).rejects.toThrow(
      'Could not read the replay file empty.log: the file is empty',
    )
    slow.resolve(rawLog(REPLAY))
    expect(await reading).toBeUndefined()
    expect((await choice.chosen())?.summary.id).toBe('smogtours-gen3ou-994086')
  })

  it('refuses a file over 5 MB by its size and never reads it', async () => {
    const { choice } = showdown()
    await choice.pickTestReplay(REPLAY_994086)
    const { file, read } = savedFile('big.log', rawLog(REPLAY), LARGEST_FILE + 1)
    const failure = await choice.loadFile(file).catch((error: unknown) => error)
    expect(failure).toEqual(
      new SessionError(
        'Could not read the replay file big.log: big.log holds 5.1 MB, and the viewer reads replay files up to 5 MB',
        undefined,
        { source: 'file', replay: 'a file of no known kind' },
      ),
    )
    const cause = (failure as SessionError).cause
    expect(cause).toBeInstanceOf(FileSizeError)
    expect(cause).toMatchObject({ fileName: 'big.log', size: LARGEST_FILE + 1, megabytes: '5.1' })
    expect(read).not.toHaveBeenCalled()
    expect((await choice.chosen())?.summary.id).toBe('smogtours-gen3ou-994086')
  })

  it('reads a file of exactly 5 MB', async () => {
    expect(LARGEST_FILE).toBe(5_242_880)
    const { file, read } = savedFile('smogtours-gen3ou-994052.log', rawLog(REPLAY), LARGEST_FILE)
    expect((await showdown().choice.loadFile(file))?.id).toBe('smogtours-gen3ou-994052')
    expect(read).toHaveBeenCalledOnce()
  })

  it('gives the size in MB rounded up to one decimal', () => {
    expect(new FileSizeError('a.html', 12 * 1024 * 1024).message).toBe(
      'a.html holds 12.0 MB, and the viewer reads replay files up to 5 MB',
    )
    expect(new FileSizeError('b.html', LARGEST_FILE + 104_858).message).toBe(
      'b.html holds 5.2 MB, and the viewer reads replay files up to 5 MB',
    )
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

  it("a pick that a newer one replaced never becomes Start's replay when the newer one fails", async () => {
    const picks = newest<string>(true)
    await picks.pick(Promise.resolve('shown'))
    const replaced = deferred<string>()
    const failing = deferred<string>()
    const second = picks.pick(replaced.promise)
    const third = picks.pick(failing.promise)
    replaced.resolve('replaced')
    expect(await second).toBeUndefined()
    failing.reject(new Error('refused'))
    await expect(third).rejects.toThrow('refused')
    expect(await picks.get()).toBe('shown')
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
