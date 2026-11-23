// The report link under a visitor line (#59): it opens the repository's issue form "Replay
// problem" with the replay and the line filled in, through the query that GitHub reads by each
// field's id. The values come from other people's replays, links and files, so each is cut and
// URL-encoded. The issue is public, so a private replay's password stays out of it.
import { withoutPassword } from '../script/replay-id'

const LONE_SURROGATE = /\p{Cs}/gu
/** U+FFFD, which stands for a character that cannot be written. */
const REPLACEMENT = String.fromCodePoint(0xfffd)

/** `text` cut to `longest` characters with "…", never inside a pair, with no lone surrogate. */
export function clip(text: string, longest: number): string {
  const cut =
    text.length <= longest ? text : `${text.slice(0, longest - 1).replace(/[\uD800-\uDBFF]$/, '')}…`
  return cut.replace(LONE_SURROGATE, REPLACEMENT)
}

/** The repository's issue form for a report, and the ids of its fields. */
export const REPORT_FORM = 'replay-problem.yml'
export const REPORT_FIELDS = { replay: 'replay', line: 'line', details: 'details' } as const

const NEW_ISSUE = 'https://github.com/FullLifeGames/ingame-replay-viewer/issues/new'
// GitHub refuses a URL of more than about 8 KB; each character takes at most 9 once encoded.
const REPORT_REPLAY_LONGEST = 200
const REPORT_LINE_LONGEST = 500

/** What a report fills in: a visitor line (visitor.ts) fits. */
interface Report {
  /**
   * The link as typed, the example's ID or the saved file's kind; none outside a pick. A private
   * replay's password part never reaches the form.
   */
  readonly replay?: string | undefined
  readonly line: string
}

/** The link that opens the issue form with the replay and the line filled in. */
export function reportLink({ replay, line }: Report): string {
  const fields: [string, string][] = [['template', REPORT_FORM]]
  if (replay !== undefined) {
    fields.push([REPORT_FIELDS.replay, clip(withoutPassword(replay), REPORT_REPLAY_LONGEST)])
  }
  fields.push([REPORT_FIELDS.line, clip(line, REPORT_LINE_LONGEST)])
  const query = fields.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  return `${NEW_ISSUE}?${query.join('&')}`
}
