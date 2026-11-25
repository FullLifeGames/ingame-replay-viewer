// What a page shows once a pick, a Load or a file settles (#32, #69): its list and its line, or
// its failure's line. DOM-free, so a Node spec covers it; replay-view.ts hands it the page's
// controls and status line.
import type { ReplaySummary } from './replay-choice'
import { pickedLine } from './status'
import { pickFailureLine, type VisitorLine } from './visitor'

/** What the flow shows on a page: the controls and the status line of replay-view.ts. */
export interface PickView {
  readonly testReplay: { selectedIndex: number }
  readonly showReplay: (summary: ReplaySummary) => void
  /** Notes where the select stands for the replay the page now holds. */
  readonly keepPick: () => void
  /** Puts the select back on the replay the page holds, after a pick failed. */
  readonly restorePick: () => void
  readonly status: (line: string) => void
  /** A visitor line with its words under "Details" and its report link. */
  readonly visitorLine: (shown: VisitorLine) => void
}

/** The id of the replay the game plays while one plays; a page that tells none leaves it out. */
export type Playing = () => string | undefined

export type Then = (summary: ReplaySummary) => void

/**
 * Shows the list of a pick, a Load or a file once it settles, then runs `then`. A failure becomes
 * the status line and puts the select back on the replay the page holds (#32).
 */
export function showPick(
  view: PickView,
  pending: Promise<ReplaySummary | undefined>,
  playing: Playing,
  then?: Then,
): Promise<void> {
  return pending
    .then((summary) => {
      if (summary === undefined) return
      view.showReplay(summary)
      then?.(summary)
      view.keepPick()
    })
    .catch((error: unknown) => {
      view.restorePick()
      view.visitorLine(pickFailureLine(error, playing()))
    })
}

/** After a pick from the select: the page asks for Start. */
export const pickedFrom =
  (view: PickView): Then =>
  (summary) => {
    view.status(pickedLine(summary.id))
  }

/** After a Load or a file: no test replay is picked, and the page asks for Start. */
export const loadedFrom =
  (view: PickView): Then =>
  (summary) => {
    view.testReplay.selectedIndex = -1
    view.status(pickedLine(summary.id))
  }
