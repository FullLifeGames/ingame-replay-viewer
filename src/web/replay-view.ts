// The replay controls both pages share (#52): the "Example replay" select, the form "Replay link
// or ID" and the "Not shown in the game" list under the game. A pick or a Load fills the list
// before Start; the texts come from status.ts, the flow's rules from replay-choice.ts, and what a
// settled pick shows from pick-lines.ts. The viewer alone reads a replay file (#56). Both pages
// write their status line here (#59): a failure's visitor line, its module's words under
// "Details", and the report link under it.
import type { ReplayChoice, ReplayPlace, ReplaySummary } from './replay-choice'
import { FIRST_REPLAY, TEST_REPLAYS } from './replays'
import { reportLink } from './report-link'
import type { NotShownRow } from './stream'
import {
  loadedFrom,
  pickedFrom,
  type PickView,
  type Playing,
  playingOf,
  showPick,
  type Then,
} from './pick-lines'
import {
  countText,
  notShownHeading,
  replayDetail,
  replaySummaryLine,
  rowParts,
  type StatusLine,
} from './status'
import { detailShown, type VisitorLine, visitorLine } from './visitor'

/** The element `#id` of `page`, which must be a `type`. */
export function element<T extends HTMLElement>(page: string, id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) throw new Error(`${page} lacks the ${type.name} #${id}`)
  return found
}

/** The elements a line fills: the line, the words under its "Details", and its report link. */
interface LineParts {
  readonly line: string
  readonly detail: string
  readonly report: string
}

const STATUS_PARTS: LineParts = { line: 'status', detail: 'status-detail', report: 'report' }
const ENVIRONMENT_PARTS: LineParts = {
  line: 'environment-line',
  detail: 'environment-detail',
  report: 'environment-report',
}

/**
 * Shows the "Details" around `part` only while one of its paragraphs holds words: a closed
 * disclosure with nothing new inside tells a visitor nothing.
 */
export function fitDetails(part: HTMLElement): void {
  const details = part.closest('details')
  if (details === null) return
  details.hidden = [...details.querySelectorAll('p')].every((words) => words.textContent === '')
}

/**
 * Writes `shown` as text, never as markup: its values come from other people's replays, links
 * and files. "Details" holds the detail unless it repeats the line (detailShown). The report link
 * gets its address from reportLink alone, and hides when the line offers none, so an old failure
 * never sits under a new line.
 */
function writeLine(page: string, parts: LineParts, shown: VisitorLine): void {
  element(page, parts.line, HTMLParagraphElement).textContent = shown.line
  const detail = element(page, parts.detail, HTMLParagraphElement)
  detail.textContent = detailShown(shown)
  fitDetails(detail)
  const report = element(page, parts.report, HTMLAnchorElement)
  if (shown.report) report.href = reportLink(shown)
  else report.removeAttribute('href')
  report.hidden = !shown.report
}

/**
 * A line of the page's own, such as a step that went well, with the words its "Details" holds, if
 * any (status.ts), and no report link.
 */
export function showLine(page: string, shown: string | StatusLine): void {
  const { line, detail } = typeof shown === 'string' ? { line: shown, detail: '' } : shown
  writeLine(page, STATUS_PARTS, { line, detail, report: false })
}

/** A visitor line (visitor.ts) on the status line, with its detail and report link. */
export function showVisitorLine(page: string, shown: VisitorLine): void {
  writeLine(page, STATUS_PARTS, shown)
}

/** A failure as its visitor line (visitor.ts); `place` names the replay when the error names none. */
export function showFailure(page: string, error: unknown, place?: ReplayPlace): void {
  showVisitorLine(page, visitorLine(error, place))
}

/** Hides everything but `shown`, for a browser that cannot run the game. */
export function showOnly(page: string, shown: VisitorLine): void {
  writeLine(page, ENVIRONMENT_PARTS, shown)
  element(page, 'environment', HTMLDivElement).hidden = false
  element(page, 'app', HTMLDivElement).hidden = true
}

/** Fills `list` with one item per text, written as text, never as markup. */
export function fill(list: HTMLElement, texts: readonly string[]): void {
  list.replaceChildren(
    ...texts.map((text) => Object.assign(document.createElement('li'), { textContent: text })),
  )
}

/**
 * Fills the "Not shown" list with one item per row, its log line's first field in a span that the
 * page keeps on one line (#90). The parts come from other people's replays: text, never markup.
 */
function fillRows(list: HTMLElement, rows: readonly NotShownRow[]): void {
  list.replaceChildren(
    ...rows.map((row) => {
      const { head, kind, rest } = rowParts(row)
      const item = document.createElement('li')
      const span = Object.assign(document.createElement('span'), {
        className: 'log-kind',
        textContent: kind,
      })
      item.append(head, ...(kind === '' ? [] : [span]), rest)
      return item
    }),
  )
}

/** The replay controls of `page`, and the call that shows a replay's summary and list. */
export function findReplayView(page: string) {
  const testReplay = element(page, 'test-replay', HTMLSelectElement)
  let held = testReplay.selectedIndex
  return {
    testReplay,
    replayForm: element(page, 'replay-form', HTMLFormElement),
    replayInput: element(page, 'replay-input', HTMLInputElement),
    /** Offers each test replay under its label; an option's value stays the replay's id. */
    offer: (examples: readonly { id: string; label: string }[], first: string): void => {
      testReplay.replaceChildren(
        ...examples.map(({ id, label }) => new Option(label, id, false, id === first)),
      )
    },
    /** The summary by its label, its counts under "Details" (#90), and the "Not shown" list. */
    showReplay: (summary: ReplaySummary): void => {
      element(page, 'replay-summary', HTMLParagraphElement).textContent = replaySummaryLine(summary)
      const detail = element(page, 'replay-detail', HTMLParagraphElement)
      detail.textContent = replayDetail(summary)
      fitDetails(detail)
      element(page, 'not-shown', HTMLHeadingElement).textContent = notShownHeading(
        summary.rows.length,
      )
      fill(element(page, 'not-shown-counts', HTMLUListElement), summary.counts.map(countText))
      fillRows(element(page, 'not-shown-rows', HTMLOListElement), summary.rows)
    },
    /** Notes where the select stands for the replay the page now holds (#32). */
    keepPick: (): void => {
      held = testReplay.selectedIndex
    },
    /** Puts the select back on the replay the page holds, after a pick failed. */
    restorePick: (): void => {
      testReplay.selectedIndex = held
    },
  }
}

type ReplayView = ReturnType<typeof findReplayView>

/** The replay controls with the page's status line. */
type StatusView = ReplayView & PickView

/**
 * What the controls ask of a page's flow: the session's or the viewer's picks, and the replay the
 * viewer's game plays, which a failed pick names (#69).
 */
type ReplayChooser = Pick<ReplayChoice, 'pickTestReplay' | 'loadReplay'> & {
  readonly playing?: Playing
}

/**
 * Offers the test replays and picks the first, so the list shows at once; a later pick or Load
 * shows its list and asks for Start.
 */
export function wireReplays(chooser: ReplayChooser, view: StatusView): void {
  const playing = playingOf(chooser)
  const pick = (id: string, then?: Then): void => {
    const replay = TEST_REPLAYS.find((test) => test.id === id)
    if (replay !== undefined) void showPick(view, chooser.pickTestReplay(replay), playing, then)
  }
  view.testReplay.addEventListener('change', () => {
    pick(view.testReplay.value, pickedFrom(view))
  })
  view.replayForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void showPick(view, chooser.loadReplay(view.replayInput.value), playing, loadedFrom(view))
  })
  view.offer(TEST_REPLAYS, FIRST_REPLAY)
  pick(FIRST_REPLAY)
}

/**
 * Reads the file picked in "Replay file" (#56) as a Load reads a link. The input forgets the file
 * at once, so the same file picked again fires a change; the file stays in the tab.
 */
export function wireReplayFile(
  chooser: Pick<ReplayChoice, 'loadFile'> & { readonly playing?: Playing },
  view: StatusView & { readonly replayFile: HTMLInputElement },
): void {
  view.replayFile.addEventListener('change', () => {
    const file = view.replayFile.files?.[0]
    if (file === undefined) return
    view.replayFile.value = ''
    void showPick(view, chooser.loadFile(file), playingOf(chooser), loadedFrom(view))
  })
}
