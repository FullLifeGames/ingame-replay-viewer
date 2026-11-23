// The replay controls both pages share (#52): the test replay select, the form "Replay link or ID"
// and the "Not shown in the game" list under the game. A pick or a Load fills the list before
// Start; the texts come from status.ts, and the flow's rules from replay-choice.ts. The viewer
// alone reads a replay file (#56).
import { messageOf } from './message'
import type { ReplayChoice, ReplaySummary } from './replay-choice'
import { FIRST_REPLAY, TEST_REPLAYS } from './replays'
import { countText, notShownHeading, pickedLine, replayLine, rowText } from './status'

/** The element `#id` of `page`, which must be a `type`. */
export function element<T extends HTMLElement>(page: string, id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) throw new Error(`${page} lacks the ${type.name} #${id}`)
  return found
}

function fill(list: HTMLElement, texts: readonly string[]): void {
  list.replaceChildren(
    ...texts.map((text) => Object.assign(document.createElement('li'), { textContent: text })),
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
    offer: (ids: readonly string[], first: string): void => {
      testReplay.replaceChildren(...ids.map((id) => new Option(id, id, false, id === first)))
    },
    showReplay: (summary: ReplaySummary): void => {
      element(page, 'replay-summary', HTMLParagraphElement).textContent = replayLine(summary)
      element(page, 'not-shown', HTMLHeadingElement).textContent = notShownHeading(
        summary.rows.length,
      )
      fill(element(page, 'not-shown-counts', HTMLUListElement), summary.counts.map(countText))
      fill(element(page, 'not-shown-rows', HTMLOListElement), summary.rows.map(rowText))
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
type StatusView = ReplayView & { readonly status: (line: string) => void }

/** What the controls ask of a page's flow: the session's or the WebAssembly page's picks. */
type ReplayChooser = Pick<ReplayChoice, 'pickTestReplay' | 'loadReplay'>

type Then = (summary: ReplaySummary) => void

/**
 * Shows the list of a pick, a Load or a file once it settles, then runs `then`. A failure becomes
 * the status line and puts the select back on the replay the page holds (#32).
 */
function showPick(
  view: StatusView,
  pending: Promise<ReplaySummary | undefined>,
  then?: Then,
): void {
  pending
    .then((summary) => {
      if (summary === undefined) return
      view.showReplay(summary)
      then?.(summary)
      view.keepPick()
    })
    .catch((error: unknown) => {
      view.restorePick()
      view.status(messageOf(error))
    })
}

/** After a Load or a file: no test replay is picked, and the page asks for Start. */
const loadedFrom =
  (view: StatusView): Then =>
  (summary) => {
    view.testReplay.selectedIndex = -1
    view.status(pickedLine(summary.id))
  }

/**
 * Offers the test replays and picks the first, so the list shows at once; a later pick or Load
 * shows its list and asks for Start.
 */
export function wireReplays(chooser: ReplayChooser, view: StatusView): void {
  const pick = (id: string, then?: Then): void => {
    const replay = TEST_REPLAYS.find((test) => test.id === id)
    if (replay !== undefined) showPick(view, chooser.pickTestReplay(replay), then)
  }
  view.testReplay.addEventListener('change', () => {
    pick(view.testReplay.value, (summary) => {
      view.status(pickedLine(summary.id))
    })
  })
  view.replayForm.addEventListener('submit', (event) => {
    event.preventDefault()
    showPick(view, chooser.loadReplay(view.replayInput.value), loadedFrom(view))
  })
  view.offer(
    TEST_REPLAYS.map((test) => test.id),
    FIRST_REPLAY,
  )
  pick(FIRST_REPLAY)
}

/**
 * Reads the file picked in "Replay file" (#56) as a Load reads a link. The input forgets the file
 * at once, so the same file picked again fires a change; the file stays in the tab.
 */
export function wireReplayFile(
  chooser: Pick<ReplayChoice, 'loadFile'>,
  view: StatusView & { readonly replayFile: HTMLInputElement },
): void {
  view.replayFile.addEventListener('change', () => {
    const file = view.replayFile.files?.[0]
    if (file === undefined) return
    view.replayFile.value = ''
    showPick(view, chooser.loadFile(file), loadedFrom(view))
  })
}
