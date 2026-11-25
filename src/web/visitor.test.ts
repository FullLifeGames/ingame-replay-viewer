import { describe, expect, it } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import { buildGen3Stream, NEWEST_GEN } from '../gen3/backend'
import { Gen3Error, GenerationRefusal } from '../gen3/errors'
import { SlotError } from '../patch/slot'
import { buildBattleScript } from '../script/build'
import { GameTypeRefusal, ScriptError } from '../script/errors'
import { readReplay } from '../script/replay'
import { downloadedFile, jsonFile, rawLog, replayPage } from '../script/saved-replay-testing'
import { fetchBytes, fetchJson } from './fetch'
import { messageOf } from './message'
import { createReplayChoice, failed, type ReplayPlace } from './replay-choice'
import { PLAYED_FORMATS, visitorLine } from './visitor'
import { RunFailure } from './wasm/failures'

const REPORT = 'Report it with the link below.'
const RELOAD = 'Reload the page. If it fails again, report it with the link below.'
const STREAM = 'Could not turn the replay into a stream'
const EXAMPLE: ReplayPlace = { source: 'example', replay: 'smogtours-gen3ou-994052' }

/** The value `work` throws. */
function caught(work: () => unknown): unknown {
  try {
    work()
  } catch (error) {
    return error
  }
  throw new Error('the work threw nothing')
}

/** The refusal of a pick that fails. */
const refusalOf = (pick: Promise<unknown>): Promise<unknown> =>
  pick.then(
    () => {
      throw new Error('the pick did not fail')
    },
    (error: unknown) => error,
  )

/** A file as the page's file input hands it on. */
const fileOf = (name: string, text: string, size = text.length) => ({
  name,
  size,
  text: () => Promise.resolve(text),
})

/** A stand-in for the browser's fetch that answers every URL with `answer`. */
const answering = (answer: Response | Error) => () =>
  answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)

const SHOWDOWN_URL = 'https://replay.pokemonshowdown.com/gen3ou-1.json'
const HTML_PAGE = '<!DOCTYPE html>\n<html><body>Not here</body></html>'
const GEN9 = readReplay({ ...replay994052, log: replay994052.log.replace('|gen|3\n', '|gen|9\n') })

describe('visitorLine for the replay', () => {
  it('names every generation the backend plays (#86)', () => {
    expect(PLAYED_FORMATS).toBe(`Gen 1 to ${String(NEWEST_GEN)} singles`)
  })

  it('gives a log that starts with |gen|9 the generation line, from the typed refusal', () => {
    const refusal = caught(() => buildGen3Stream(buildBattleScript('|gen|9\n')))
    expect(refusal).toBeInstanceOf(GenerationRefusal)
    const link: ReplayPlace = { source: 'link', replay: 'gen9ou-1' }
    expect(visitorLine(failed(STREAM, refusal, link))).toEqual({
      line: `This replay is a Gen 9 battle. The viewer plays ${PLAYED_FORMATS} for now.`,
      detail: `${STREAM}: the stream plays Gen 1 to ${String(NEWEST_GEN)} battles, this one is Gen 9`,
      report: false,
      replay: 'gen9ou-1',
    })
  })

  it('reads the generation from the refusal, never from its message', () => {
    const refusal = Object.assign(new GenerationRefusal(7, 3), { message: 'this one is Gen 8' })
    expect(visitorLine(refusal).line).toMatch(/^This replay is a Gen 7 battle\./)
  })

  it('gives a doubles log the game type line, from the typed refusal', () => {
    const refusal = caught(() => buildBattleScript('|gametype|doubles\n'))
    expect(visitorLine(refusal)).toEqual({
      line: 'This replay is not a singles battle (Showdown calls it "doubles"). The viewer plays singles for now.',
      detail: messageOf(refusal),
      report: false,
    })
  })

  // A file's |gametype| line can be megabytes long; the line holds 120 characters of it.
  it('cuts a long game type to 120 characters', () => {
    const line = visitorLine(new GameTypeRefusal(0, 'x'.repeat(5_000_000))).line
    expect(line).toContain(`"${'x'.repeat(119)}…"`)
    expect(line.length).toBeLessThan(250)
  })

  it('gives a link whose JSON holds no replay the link line, and names the trimmed link', async () => {
    const choice = createReplayChoice(() => Promise.resolve({ id: 'x' }))
    const refusal = await refusalOf(choice.loadReplay(' gen3ou-1 '))
    expect(visitorLine(refusal)).toEqual({
      line: 'Showdown sent no replay for this link. Check the link and try again.',
      detail: messageOf(refusal),
      report: false,
      replay: 'gen3ou-1',
    })
  })

  it('gives a file that holds no replay the file line, and no kind to report', async () => {
    const choice = createReplayChoice(() => Promise.reject(new Error('offline')))
    const refusal = await refusalOf(choice.loadFile(fileOf('notes.txt', 'Bring snacks.')))
    expect(visitorLine(refusal)).toEqual({
      line:
        'This file holds no Showdown replay. The viewer reads a replay saved with "Download replay", ' +
        "a saved replay page, a battle log, or a replay's JSON file.",
      detail: messageOf(refusal),
      report: false,
      replay: 'a file of no known kind',
    })
  })

  it.each([
    [downloadedFile(GEN9), 'a replay saved with "Download replay"'],
    [replayPage(GEN9), 'a saved replay page'],
    [rawLog(GEN9), 'a battle log'],
    [jsonFile(GEN9), "a replay's JSON file"],
  ])('names the kind of a saved file, never its name: %#', async (text, kind) => {
    const choice = createReplayChoice(() => Promise.reject(new Error('offline')))
    const refusal = await refusalOf(choice.loadFile(fileOf('My replay.html', text)))
    expect(visitorLine(refusal)).toMatchObject({ report: false, replay: kind })
    expect(visitorLine(refusal).line).toMatch(/^This replay is a Gen 9 battle\./)
  })

  // A phone that drops the network while the page fetches the example's file (#59).
  it('asks for the example again when its file does not load, with no report', async () => {
    const choice = createReplayChoice(() => Promise.reject(new Error('offline')))
    const gone = new TypeError('Failed to fetch dynamically imported module: /fixture.json')
    const broken = { id: 'broken', load: () => Promise.reject(gone) }
    const refusal = await refusalOf(choice.pickTestReplay(broken))
    expect(visitorLine(refusal)).toEqual({
      line: 'The page could not load this example. Check your connection and pick it again.',
      detail: `Could not load the example replay broken: ${gone.message}`,
      report: false,
      replay: 'broken',
    })
  })

  it('keeps the line of an example that loads but holds a log the viewer cannot follow', async () => {
    const choice = createReplayChoice(() => Promise.reject(new Error('offline')))
    const doubles = replay994052.log.replace('|gametype|singles', '|gametype|doubles')
    const example = {
      id: 'doubles',
      load: () => Promise.resolve({ ...replay994052, log: doubles }),
    }
    const refusal = await refusalOf(choice.pickTestReplay(example))
    expect(visitorLine(refusal).line).toMatch(/^This replay is not a singles battle /)
  })

  it('counts the line of a ScriptError from one, in the line and in "Details"', () => {
    const refusal = failed(STREAM, new ScriptError(41, 'the HP "x" does not parse'), EXAMPLE)
    expect(visitorLine(refusal)).toEqual({
      line: `The viewer cannot follow line 42 of this replay's battle log. ${REPORT}`,
      detail: `${STREAM}: line 42: the HP "x" does not parse`,
      report: true,
      replay: EXAMPLE.replay,
    })
  })

  // The tester's two scenes (#59), by link and as a JSON file: one number for one line.
  const NOBODY = {
    ...replay994052,
    log: replay994052.log.replace('|turn|1\n', '|turn|1\n|-damage|p1a: Nobody|50/100\n'),
  }
  const DOUBLES = {
    ...replay994052,
    log: replay994052.log.replace('|gametype|singles', '|gametype|doubles'),
  }
  it.each([
    ['a Pokémon that never appeared', 29, NOBODY, 'no Pokémon "p1a: Nobody" has appeared'],
    ['the game type doubles', 3, DOUBLES, 'the game type "doubles" is not singles'],
  ])(
    'gives %s on line %i the same number in the line and in "Details"',
    async (_, number, json, reason) => {
      expect(json.log.split('\n')[number - 1]).toMatch(/^\|(?:-damage|gametype)\|/)
      const choice = createReplayChoice(() => Promise.resolve(json))
      const file = fileOf('mine.json', jsonFile(readReplay(json)))
      for (const pick of [() => choice.loadReplay('gen3ou-1'), () => choice.loadFile(file)]) {
        const { line, detail } = visitorLine(await refusalOf(pick()))
        if (number === 29)
          expect(line).toContain(`line ${String(number)} of this replay's battle log`)
        expect(detail).toContain(`line ${String(number)}: ${reason}`)
      }
    },
  )

  it('gives any other Gen3Error and a stream the slot cannot hold the game line', () => {
    const game = `The game cannot show this replay. ${REPORT}`
    expect(visitorLine(new Gen3Error('the party holds 7 Pokémon'))).toMatchObject({ line: game })
    const write = new SlotError('the stream has 40000 bytes, the replay slot holds 16')
    expect(visitorLine(failed('Could not write the replay into the ROM', write))).toEqual({
      line: game,
      detail: `Could not write the replay into the ROM: ${write.message}`,
      report: true,
    })
    const run = new RunFailure({ kind: 'write', line: 'Could not write the replay: too long' })
    expect(visitorLine(run, EXAMPLE)).toMatchObject({ line: game, replay: EXAMPLE.replay })
  })

  it("prefers the place a SessionError names over the caller's, inside nested steps", () => {
    const inner = failed(STREAM, new Gen3Error('x'), EXAMPLE)
    const outer = failed('Could not start', inner)
    const link: ReplayPlace = { source: 'link', replay: 'gen3ou-1' }
    expect(visitorLine(outer, link)).toMatchObject({ report: true, replay: EXAMPLE.replay })
    expect(visitorLine(outer, link).detail).toBe(`Could not start: ${STREAM}: x`)
  })
})

describe('visitorLine for a fetch', () => {
  const showdown = async (answer: Response | Error) =>
    visitorLine(await refusalOf(fetchJson(SHOWDOWN_URL, answering(answer))))

  it('says Showdown has no such replay on a 404, without the HTML body', async () => {
    const line = await showdown(new Response(HTML_PAGE, { status: 404 }))
    expect(line).toEqual({
      line: 'Showdown has no replay with this ID.',
      detail: `${SHOWDOWN_URL} answered 404: <!DOCTYPE html>`,
      report: false,
    })
  })

  it('names Showdown when it gave no answer', async () => {
    expect((await showdown(new TypeError('Failed to fetch'))).line).toBe(
      'The page could not reach replay.pokemonshowdown.com. Check your connection and try again.',
    )
  })

  it('gives another status of Showdown with the status', async () => {
    expect((await showdown(new Response('', { status: 503 }))).line).toBe(
      'Showdown could not send this replay (503). Try again later.',
    )
  })

  it('gives an answer of Showdown that is no JSON the link line', async () => {
    expect((await showdown(new Response('oops'))).line).toBe(
      'Showdown sent no replay for this link. Check the link and try again.',
    )
  })

  it("names the page's own file and its status, never the HTML body of a refused fetch", async () => {
    const path = 'wasm/irv-emerald-wasm.bps'
    const refusal = await refusalOf(
      fetchBytes(path, answering(new Response(HTML_PAGE, { status: 500 }))),
    )
    const line = visitorLine(refusal)
    expect(line).toEqual({
      line: `The page could not load its game file irv-emerald-wasm.bps (500). ${RELOAD}`,
      detail: `${path} answered 500: <!DOCTYPE html>`,
      report: true,
    })
    expect(line.line).not.toContain('<')
  })

  it("says no answer for the page's own file that got none", async () => {
    const refusal = await refusalOf(fetchJson('rom/replay-slot.json', answering(new TypeError())))
    expect(visitorLine(refusal).line).toMatch(/^The page could not load its game file /)
    expect(visitorLine(refusal).line).toContain('replay-slot.json (no answer)')
  })
})
