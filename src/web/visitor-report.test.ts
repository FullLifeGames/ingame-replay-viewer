import { describe, expect, it } from 'vitest'

import { environmentProblem } from './environment'
import { REPORT_FIELDS, REPORT_FORM, reportLink } from './report-link'
import { environmentLine, fillLine, PLAYED_FORMATS, VISITOR_LINES } from './visitor'

// The issue forms of the repository, by path; GitHub reads them from .github/ISSUE_TEMPLATE/.
const FORMS = import.meta.glob<string>('../../.github/ISSUE_TEMPLATE/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** A real value for each slot a line can hold. */
const REAL_VALUES: Readonly<Record<string, string>> = {
  gen: '9',
  formats: PLAYED_FORMATS,
  gameType: 'doubles',
  line: '42',
  status: '404',
  file: 'smogtours-gen3ou-994052.json',
  size: '5.1',
  largest: '5',
  address: 'https://viewer.example.org/replays/',
  words: 'Pick your US Emerald dump first, then press Start.',
}

/** U+FFFD, the character that stands for one that cannot be written. */
const REPLACEMENT = String.fromCodePoint(0xfffd)

const FORBIDDEN = ['npm run', 'localhost', 'devbox', 'tailscale', 'README', '<']
const SLOT = /\{(\w+)\}/g

describe('VISITOR_LINES', () => {
  it.each(Object.entries(VISITOR_LINES))('renders %s with real values for visitors', (_, entry) => {
    for (const [, name = ''] of entry.text.matchAll(SLOT)) expect(REAL_VALUES).toHaveProperty(name)
    const line = fillLine(entry.text, REAL_VALUES)
    expect(line).not.toMatch(/[{}]/)
    for (const word of FORBIDDEN) expect(line).not.toContain(word)
    expect(line).toMatch(/[.)]$/)
    expect(line).not.toMatch(/—|--/)
  })

  it.each(Object.entries(VISITOR_LINES))(
    'offers the report link on %s only when it says so',
    (_, entry) => {
      expect(/report it with the link below\.$/i.test(entry.text)).toBe(entry.report)
    },
  )
})

describe('fillLine', () => {
  it('fills each slot once, so a value that holds a slot stays as written', () => {
    const values = { gameType: '{gen} {formats}', gen: '9', formats: 'x' }
    expect(fillLine('calls it "{gameType}"', values)).toBe('calls it "{gen} {formats}"')
  })

  it('leaves a slot it has no value for as written', () => {
    expect(fillLine('Gen {gen}', {})).toBe('Gen {gen}')
  })
})

describe('environmentLine', () => {
  const at = { host: 'viewer.example.org:8443', pathname: '/replays/index.html' }
  const lineOf = (isSecureContext: boolean, crossOriginIsolated: boolean, moduleWorkers = true) => {
    const problem = environmentProblem(
      { isSecureContext, crossOriginIsolated, moduleWorkers },
      'the game',
    )
    if (problem === undefined) throw new Error('no problem')
    return { problem, line: environmentLine(problem, at) }
  }

  it('sends a page opened over http:// to its own https: address', () => {
    const { problem, line } = lineOf(false, false)
    expect(problem.kind).toBe('insecure')
    expect(line).toEqual({
      line: 'This page needs HTTPS. Open https://viewer.example.org:8443/replays/index.html.',
      detail: problem.detail,
      report: false,
    })
    expect(line.detail).toContain('secure context')
  })

  it('asks for a reload and offers the report when the browser did not isolate the page', () => {
    const { problem, line } = lineOf(true, false)
    expect(problem.kind).toBe('isolation')
    expect(line).toEqual({
      line:
        'Your browser did not isolate this page, so the game cannot run. Reload the page. If it ' +
        'fails again, report it with the link below.',
      detail: problem.detail,
      report: true,
    })
  })

  it('names the browsers that start a module worker', () => {
    const { problem, line } = lineOf(true, true, false)
    expect(problem.kind).toBe('workers')
    expect(line).toEqual({ line: problem.detail, detail: problem.detail, report: false })
  })
})

describe('reportLink', () => {
  const NEW_ISSUE = 'https://github.com/FullLifeGames/ingame-replay-viewer/issues/new'

  it('opens the form and fills the replay and the line by their field ids', () => {
    const replay = 'https://replay.pokemonshowdown.com/gen3ou-1?p2'
    const line = 'The game stopped during this replay. Report it with the link below.'
    const link = reportLink({ replay, line })
    expect(link).toBe(
      `${NEW_ISSUE}?template=${REPORT_FORM}&replay=${encodeURIComponent(replay)}` +
        `&line=${encodeURIComponent(line)}`,
    )
    const url = new URL(link)
    expect(url.searchParams.get(REPORT_FIELDS.replay)).toBe(replay)
    expect(url.searchParams.get(REPORT_FIELDS.line)).toBe(line)
  })

  it('keeps a value with & = # + and spaces inside its field', () => {
    const replay = 'a&line=x#y + z?'
    const url = new URL(reportLink({ replay, line: 'one' }))
    expect(url.searchParams.get('replay')).toBe(replay)
    expect(url.searchParams.getAll('line')).toEqual(['one'])
    expect(url.hash).toBe('')
  })

  // The issue is public: a private replay's link reaches it without its password part.
  describe("leaves a private replay's password out", () => {
    const HOST = 'https://replay.pokemonshowdown.com'
    const PRIVATE = 'gen3ou-2345678901-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5pw'
    const replayOf = (replay: string) =>
      new URL(reportLink({ replay, line: 'x' })).searchParams.get('replay')

    it.each(['smogtours-gen3ou-994052', `${HOST}/smogtours-gen3ou-994052?p2`])(
      'keeps the public %s as it is',
      (replay) => {
        expect(replayOf(replay)).toBe(replay)
      },
    )

    it('cuts the password part from an ID', () => {
      expect(replayOf(PRIVATE)).toBe('gen3ou-2345678901')
    })

    it('cuts it from a link and keeps the host, the ID and the rest', () => {
      expect(replayOf(`${HOST}/${PRIVATE}?p2#turn-3`)).toBe(`${HOST}/gen3ou-2345678901?p2#turn-3`)
    })

    it('keeps an ID whose last part ends in pw after no number part', () => {
      expect(replayOf('smogtours-gen3ou-abcpw')).toBe('smogtours-gen3ou-abcpw')
    })
  })

  it('leaves the replay out when the line names none', () => {
    expect(reportLink({ line: 'x' })).toBe(`${NEW_ISSUE}?template=${REPORT_FORM}&line=x`)
  })

  // A link or a file's line can be megabytes long; GitHub refuses a URL of more than about 8 KB.
  it('cuts the replay to 200 and the line to 500 characters, so the link stays under 8000', () => {
    const replay = 'é'.repeat(5_000_000)
    const link = reportLink({ replay, line: '€'.repeat(5_000_000) })
    expect(link.length).toBeLessThan(8000)
    const url = new URL(link)
    expect(url.searchParams.get('replay')).toBe(`${'é'.repeat(199)}…`)
    expect(url.searchParams.get('line')).toBe(`${'€'.repeat(499)}…`)
  })

  // encodeURIComponent throws a URIError on a lone surrogate.
  it('writes a lone surrogate as U+FFFD, and never cuts a pair in half', () => {
    const url = new URL(reportLink({ replay: `${'x'.repeat(198)}😀y`, line: 'a\uD800b\uDC00' }))
    expect(url.searchParams.get('replay')).toBe(`${'x'.repeat(198)}…`)
    expect(url.searchParams.get('line')).toBe(`a${REPLACEMENT}b${REPLACEMENT}`)
  })
})

describe('the issue form', () => {
  const form = FORMS[`../../.github/ISSUE_TEMPLATE/${REPORT_FORM}`] ?? ''

  it('is the one the report link names', () => {
    expect(Object.keys(FORMS)).toContain(`../../.github/ISSUE_TEMPLATE/${REPORT_FORM}`)
  })

  it.each(Object.values(REPORT_FIELDS))('holds the field %s as an input or a textarea', (id) => {
    expect(form).toMatch(new RegExp(`^ {2}- type: (?:input|textarea)\\n {4}id: ${id}$`, 'm'))
  })

  it("says that a private replay's link arrives without its password, in a public issue", () => {
    const replay = form.slice(form.indexOf('id: replay'), form.indexOf('id: line'))
    expect(replay).toMatch(/private replay's link arrives without its password/)
    expect(replay).toMatch(/public/)
  })

  it('sets the label needs triage', () => {
    // Prettier writes the YAML with single quotes; YAML reads both alike.
    expect(form).toMatch(/^labels: \[(['"])needs triage\1\]$/m)
  })
})
