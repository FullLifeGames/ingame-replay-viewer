import { describe, expect, it } from 'vitest'

import replay994176 from '../../test/fixtures/replays/smogtours-gen3ou-994176.json'
import { FetchError } from './fetch'
import type { TestReplay } from './replays'
import { ROM_FILES } from './rom-files'
import { SessionError } from './replay-choice'
import {
  BASE,
  DESCRIPTION,
  MISSING,
  OTHER_DUMP,
  PATCH,
  ready,
  SHOWDOWN_994176,
  STREAM_994052,
  world,
} from './session-testing'

describe('a replay from Showdown', () => {
  it('fetches the JSON that an ID names and gives its stream', async () => {
    const { session, fetched } = world()
    expect((await session.loadReplay(' smogtours-gen3ou-994176 '))?.id).toBe(
      'smogtours-gen3ou-994176',
    )
    expect(fetched).toEqual([SHOWDOWN_994176])
  })

  it('refuses a link to another host without a request', async () => {
    const { session, fetched } = world()
    await expect(session.loadReplay('https://example.com/gen3ou-1')).rejects.toThrow(
      new SessionError(
        'Could not read the replay link: example.com is not replay.pokemonshowdown.com: ' +
          'paste a replay ID or a link to replay.pokemonshowdown.com',
      ),
    )
    expect(fetched).toEqual([])
  })

  it('names the fetch when Showdown has no such replay', async () => {
    const { session } = world()
    const url = 'https://replay.pokemonshowdown.com/gen3ou-1.json'
    await expect(session.loadReplay('gen3ou-1')).rejects.toThrow(
      new SessionError(`Could not fetch the replay: ${url} answered 404`),
    )
  })

  it('names the stream step for a Gen 9 battle', async () => {
    const { session, answers } = world()
    const log = replay994176.log.replace('|gen|3\n', '|gen|9\n')
    answers.set(SHOWDOWN_994176, { ...replay994176, log })
    await expect(session.loadReplay('smogtours-gen3ou-994176')).rejects.toThrow(
      new SessionError(
        'Could not turn the replay into a stream: the stream plays Gen 3 battles, this one is Gen 9',
      ),
    )
  })

  it('names the test replay that does not load', async () => {
    const { session } = world()
    const broken: TestReplay = { id: 'broken', load: () => Promise.reject(new Error('chunk gone')) }
    await expect(session.pickTestReplay(broken)).rejects.toThrow(
      new SessionError('Could not load the test replay broken: chunk gone'),
    )
  })

  it('names a failure that is not an Error by its text', async () => {
    const { session } = world()
    const broken: TestReplay = {
      id: 'broken',
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
      load: () => Promise.reject('offline'),
    }
    await expect(session.pickTestReplay(broken)).rejects.toThrow(
      new SessionError('Could not load the test replay broken: offline'),
    )
  })
})

describe('a step that fails', () => {
  // build/rom/ lacks the patch: the dev server's 404 line reaches the page.
  it("names the patch fetch and keeps the server's line, then fetches again", async () => {
    const { session, answers, fetched } = world()
    answers.set(ROM_FILES.patch, new FetchError(`${ROM_FILES.patch} answered 404: ${MISSING}`))
    await expect(session.pickDump(BASE)).rejects.toThrow(
      new SessionError(`Could not fetch the patch: ${ROM_FILES.patch} answered 404: ${MISSING}`),
    )
    answers.set(ROM_FILES.patch, PATCH)
    expect(await session.pickDump(BASE)).toEqual({ romSha1: DESCRIPTION.romSha1 })
    expect(fetched.filter((url) => url === ROM_FILES.patch)).toHaveLength(2)
  })

  it('names replay-slot.json when it fails to fetch or to read', async () => {
    const { session, answers } = world()
    answers.set(ROM_FILES.slot, new FetchError(`${ROM_FILES.slot} answered 404`))
    await expect(session.pickDump(BASE)).rejects.toThrow(
      new SessionError(`Could not fetch replay-slot.json: ${ROM_FILES.slot} answered 404`),
    )
    answers.set(ROM_FILES.slot, { ...DESCRIPTION, offset: 'x' })
    await expect(session.pickDump(BASE)).rejects.toThrow(
      new SessionError(
        'Could not read replay-slot.json: replay-slot.json lacks "offset" or holds the wrong type there',
      ),
    )
  })

  it('names the slot write when the stream does not fit', async () => {
    const { session, answers } = world()
    answers.set(ROM_FILES.slot, { ...DESCRIPTION, capacity: 0x10 })
    await ready(session)
    await expect(session.start()).rejects.toThrow(
      new SessionError(
        `Could not write the replay into the ROM: the stream has ${String(STREAM_994052.length)} ` +
          'bytes, the replay slot holds 16',
      ),
    )
  })

  it('names the emulator when it does not load, and loads it again at the next Start', async () => {
    const { session, log, runs } = world()
    await ready(session)
    log.refuseLoad = true
    await expect(session.start()).rejects.toThrow(
      new SessionError('Could not start the emulator: WebAssembly.instantiate(): out of memory'),
    )
    log.refuseLoad = false
    await session.start()
    expect([log.loads, runs.length]).toEqual([2, 1])
  })

  it('names the emulator when it refuses the ROM', async () => {
    const { session, log } = world()
    await ready(session)
    log.refuseRun = true
    await expect(session.start()).rejects.toThrow(
      new SessionError('Could not start the emulator: The emulator did not accept the ROM.'),
    )
  })

  // A wrong file costs no download of the 18 MB patch, and the refusal needs no build.
  it('refuses a dump that is not US Emerald before it fetches anything', async () => {
    const { session, fetched } = world()
    await expect(session.pickDump(OTHER_DUMP)).rejects.toThrow(
      /^Could not patch your dump: This file is not the US Emerald dump/,
    )
    expect(fetched).toEqual([])
  })

  it('keeps the cause of a refusal', async () => {
    const { session } = world()
    const refusal = await session.pickDump(OTHER_DUMP).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(SessionError)
    expect((refusal as SessionError).cause).toMatchObject({ name: 'RomError' })
  })
})
