import { describe, expect, it } from 'vitest'

import fixture from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import { type Replay, readReplay, ReplayError } from './replay'
import { readSavedReplay, savedKind } from './saved-replay'
import { downloadedFile, jsonFile, rawLog, replayPage } from './saved-replay-testing'

const REPLAY = readReplay(fixture)
const LOG_NAME = 'smogtours-gen3ou-994052.log'

const SHAPES = [
  { kind: 'downloaded', text: downloadedFile(REPLAY), name: 'A Welcome Guest vs xXEricXx.html' },
  { kind: 'page', text: replayPage(REPLAY), name: 'Replay.html' },
  { kind: 'log', text: rawLog(REPLAY), name: LOG_NAME },
  { kind: 'json', text: jsonFile(REPLAY), name: 'smogtours-gen3ou-994052.json' },
] as const

/** A replay of 994052 whose log is `lines`, one line each, ending with a newline. */
function replayOf(lines: readonly string[]): Replay {
  return { ...REPLAY, log: `${lines.join('\n')}\n` }
}

describe('readSavedReplay reads each kind', () => {
  it.each(SHAPES)('gives the fixture\'s replay from the "$kind" shape', ({ text, name }) => {
    expect(readSavedReplay(text, name)).toEqual({
      id: 'smogtours-gen3ou-994052',
      format: '[Gen 3] OU',
      formatid: 'gen3ou',
      players: ['A Welcome Guest', 'xXEricXx'],
      log: REPLAY.log,
    })
  })

  it.each(SHAPES)('names the "$kind" shape', ({ kind, text }) => {
    expect(savedKind(text)).toBe(kind)
  })

  // The downloaded file holds the rendered log after the data element, with a "|turn|" line of
  // its own; the reader takes the data element alone.
  it('reads the data element and never the rendered log', () => {
    const text = downloadedFile(REPLAY)
    expect(text).toContain('battle-log-inline')
    expect(readSavedReplay(text, 'x.html').log.split('\n|turn|')).toHaveLength(29)
  })

  it.each(SHAPES)(
    'reads the "$kind" shape with a byte-order mark and CRLF line ends as the plain one',
    ({ text, name }) => {
      const windows = `\uFEFF${text.replaceAll('\n', '\r\n')}`
      expect(readSavedReplay(windows, name)).toEqual(readSavedReplay(text, name))
      expect(savedKind(windows)).toBe(savedKind(text))
    },
  )
})

describe('readSavedReplay turns "\\/" back into "/"', () => {
  const chat = replayOf(['|j|☆A', '|c|☆A|see https://example.com', '|player|p1|A|1|'])

  it('in the downloaded file, which writes every "/" as "\\/"', () => {
    const text = downloadedFile(chat)
    expect(text).toContain('|c|☆A|see https:\\/\\/example.com')
    expect(readSavedReplay(text, 'x.html').log).toBe(chat.log)
  })

  it('in a saved replay page', () => {
    const text = replayPage(chat).replace('https://', 'https:\\/\\/')
    expect(readSavedReplay(text, 'x.html').log).toBe(chat.log)
  })
})

describe('readSavedReplay picks the id', () => {
  const page = replayPage(REPLAY)
  const element = '<script type="text/plain" class="log" id="replaylog-smogtours-gen3ou-994052">'
  const bare = '<script type="text/plain" class="log">'

  it("takes the log element's id first", () => {
    const text = `<input type="hidden" name="replayid" value="from-input" />\n${page}`
    expect(readSavedReplay(text, 'from-name.html').id).toBe('smogtours-gen3ou-994052')
  })

  it('takes the replayid input when the log element has no id', () => {
    const text = `<input type="hidden" name="replayid" value="from-input" />\n${page}`
    expect(readSavedReplay(text.replace(element, bare), 'from-name.html').id).toBe('from-input')
  })

  it('takes the file name without its extension when the page names no id', () => {
    expect(readSavedReplay(page.replace(element, bare), 'saved.page.html').id).toBe('saved.page')
    expect(readSavedReplay(page.replace(element, bare), 'saved').id).toBe('saved')
  })

  it('reads an element id without the replaylog- prefix as no id', () => {
    const text = page.replace(element, '<script type="text/plain" class="log" id="other">')
    expect(readSavedReplay(text, 'from-name.html').id).toBe('from-name')
  })

  it('gives a battle log the file name as its id', () => {
    expect(readSavedReplay(rawLog(REPLAY), 'battle.log').id).toBe('battle')
  })
})

describe('readSavedReplay reads the fields from the log', () => {
  it('gives empty format fields to a log without a |tier| line', () => {
    const replay = readSavedReplay('|player|p1|A|1|\n|player|p2|B|2|\n', 'x.log')
    expect(replay).toMatchObject({ format: '', formatid: '', players: ['A', 'B'] })
  })

  it('takes the first player line that names its player', () => {
    const lines = ['|player|p1|', '|player|p1|A|1|', '|player|p2|B|2|', '|player|p1|C|1|']
    expect(readSavedReplay(lines.join('\n'), 'x.log').players).toEqual(['A', 'B'])
  })

  it('lists only the players the log names', () => {
    expect(readSavedReplay('|player|p2|B|2|\n', 'x.log').players).toEqual(['B'])
  })

  it('ends the log with one newline and drops the blank lines before it', () => {
    expect(readSavedReplay('\n \n|turn|1\n\n\n', 'x.log').log).toBe('|turn|1\n')
  })
})

describe('readSavedReplay finds the log element', () => {
  const page = replayPage(REPLAY)
  const open = '<script type="text/plain" class="log" id="replaylog-smogtours-gen3ou-994052">'

  it('matches the class token, not the whole attribute', () => {
    const text = page.replace(open, '<script type="text/plain" class="log wide" id="x">')
    expect(readSavedReplay(text, 'x.html').log).toBe(REPLAY.log)
  })

  it('reads the tag names and attributes in any case', () => {
    const text = page.replace(open, "<SCRIPT TYPE='text/plain' CLASS=log>")
    expect(readSavedReplay(text, 'x.html').log).toBe(REPLAY.log)
    expect(readSavedReplay('<SCRIPT CLASS="log">|turn|1</SCRIPT>', 'x.html').log).toBe('|turn|1\n')
  })

  it('skips a script whose class only starts like a log', () => {
    const text = `<script class="logs">|turn|1</script><script class=battle-log>|turn|2</script>`
    expect(() => readSavedReplay(text, 'x.html')).toThrow('the page holds no battle log')
  })

  it("skips a log element's look-alike inside another script", () => {
    const decoy = `<script>document.write('<script class="log">|turn|1<\\/script>')</script>`
    const text = `${decoy}\n${page}`
    expect(readSavedReplay(text, 'x.html').log).toBe(REPLAY.log)
  })

  it('takes the downloaded data element before a page log element', () => {
    const data = `<script type="text/plain" class="battle-log-data">|turn|7</script>`
    expect(readSavedReplay(`${page}\n${data}`, 'x.html').log).toBe('|turn|7\n')
    expect(savedKind(`${page}\n${data}`)).toBe('downloaded')
  })
})

describe('readSavedReplay refuses', () => {
  const KINDS =
    "the file holds no replay the viewer reads: it reads a replay saved with Showdown's " +
    "Download replay, a saved replay page, a battle log, or a replay's JSON file"

  it.each(['', '  \n\r\n\t', '\uFEFF'])('an empty file (%j)', (text) => {
    expect(() => readSavedReplay(text, 'x')).toThrow(new ReplayError('the file is empty'))
    expect(savedKind(text)).toBeUndefined()
  })

  it.each([
    ['plain text', 'hello\n|turn|1\n'],
    ['an MHTML save', 'MIME-Version: 1.0\nContent-Type: multipart/related\n\n|turn|1\n|turn|2\n'],
    ['a PDF', '%PDF-1.7\n|turn|1\n'],
  ])('a file of no known kind: %s', (_, text) => {
    expect(() => readSavedReplay(text, 'x')).toThrow(new ReplayError(KINDS))
    expect(savedKind(text)).toBeUndefined()
  })

  it('JSON that does not parse, with the kinds line', () => {
    expect(() => readSavedReplay('{"id": ', 'x.json')).toThrow(new ReplayError(KINDS))
  })

  it('replay JSON without a log, through readReplay', () => {
    expect(() => readSavedReplay('{"id": "x"}', 'x.json')).toThrow(/"log"/)
  })

  it.each([
    ['no script', '<!DOCTYPE html>\n<p>|turn|1</p>'],
    ['an unclosed log element', '<script class="log">|turn|1\n'],
    ['an empty log element', '<script class="log">\n \n</script>'],
    ['an unclosed tag', '<script class="log"'],
  ])('an HTML file with %s', (_, text) => {
    expect(() => readSavedReplay(text, 'x.html')).toThrow(
      new ReplayError('the page holds no battle log'),
    )
  })

  it('names no kind for an HTML file without a log element', () => {
    expect(savedKind('<p>|turn|1</p>')).toBeUndefined()
  })
})

// The reader runs on files from anywhere: every scan runs once over the text.
describe('readSavedReplay on long hostile files', () => {
  const LONG = 200_000

  function timed(text: string): number {
    const start = Date.now()
    try {
      readSavedReplay(text, 'x.html')
    } catch (error) {
      expect(error).toBeInstanceOf(ReplayError)
    }
    return Date.now() - start
  }

  it.each([
    ['unclosed script starts', '<script '.repeat(LONG)],
    ['unclosed log scripts', '<script class="log">'.repeat(LONG)],
    ['scripts that never close', '<script>'.repeat(LONG)],
    ['unclosed attribute quotes', `<script ${'class="x '.repeat(LONG)}>`],
    ['attribute names without values', `<script ${'class '.repeat(LONG)}>`],
    ['unclosed inputs', `${'<input name=replayid'.repeat(LONG)}<script class="log">|t|</script>`],
    ['newlines', `${'\n'.repeat(LONG)}x${'\n'.repeat(LONG)}`],
  ])('reads %s at once', (_, text) => {
    expect(timed(text)).toBeLessThan(1000)
  })
})
