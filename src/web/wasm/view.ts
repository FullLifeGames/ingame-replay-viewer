// The viewer's DOM: the elements of index.html and what main.ts shows in them.
// The replay controls and the list come from replay-view.ts, as on the emulator page.
import type { ReplayPlace, ReplaySummary } from '../replay-choice'
import {
  findReplayView,
  fitDetails,
  element as pageElement,
  showFailure,
  showLine,
  showOnly,
  showVisitorLine,
} from '../replay-view'
import type { PanelText } from '../status'
import type { VisitorLine } from '../visitor'
import type { PauseButton } from './pause'
import { SPEEDS, type Speed } from './protocol'

const PAGE = 'index.html'

const element = <T extends HTMLElement>(id: string, type: new () => T): T =>
  pageElement(PAGE, id, type)

const isSpeed = (value: string): value is Speed => (SPEEDS as readonly string[]).includes(value)

const PANEL_LINES = ['far', 'near', 'turn'] as const

/**
 * Writes the panel's lines (#58) as text, never as markup: the names come from other people's
 * replays. A line that did not change stays, so the loop writes once per change.
 */
function findPanel(): (text: PanelText) => void {
  const lines = PANEL_LINES.map(
    (key) => [key, element(`panel-${key}`, HTMLParagraphElement)] as const,
  )
  return (text) => {
    for (const [key, line] of lines) {
      if (line.textContent !== text[key]) line.textContent = text[key]
    }
  }
}

/**
 * The Pause button (#57), the call that shows its label and state, and the one that focuses it.
 * The loop calls the first on each frame, so it writes only a change.
 */
function findPause() {
  const pause = element('pause', HTMLButtonElement)
  return {
    pause,
    showPause: ({ label, disabled }: PauseButton): void => {
      if (pause.textContent !== label) pause.textContent = label
      if (pause.disabled !== disabled) pause.disabled = disabled
    },
    /** Moves the focus to Pause; a disabled button takes no focus, so it enables it first. */
    focusPause: (): void => {
      pause.disabled = false
      pause.focus()
    },
  }
}

/** The shared replay view, which also keeps the summary it showed last, for the panel. */
function findShownReplayView() {
  const replayView = findReplayView(PAGE)
  let shown: ReplaySummary | undefined
  return {
    ...replayView,
    showReplay: (summary: ReplaySummary): void => {
      replayView.showReplay(summary)
      shown = summary
    },
    /** The replay the list shows: the newest pick that did not fail. */
    shownReplay: (): ReplaySummary | undefined => shown,
  }
}

/** The page's controls, and the calls that show the run's state. */
export function findWasmView() {
  const progress = element('progress', HTMLParagraphElement)
  const speeds = element('speed', HTMLFieldSetElement)
  const checkedSpeed = (): Speed => {
    const value = speeds.querySelector<HTMLInputElement>('input:checked')?.value ?? '1x'
    return isSpeed(value) ? value : '1x'
  }
  return {
    ...findShownReplayView(),
    dump: element('dump', HTMLInputElement),
    replayFile: element('replay-file', HTMLInputElement),
    start: element('start', HTMLButtonElement),
    restart: element('restart', HTMLButtonElement),
    ...findPause(),
    canvas: element('screen', HTMLCanvasElement),
    speed: checkedSpeed,
    /** Checks the radio of `speed`, as when the page leaves fast at END; fires no change. */
    showSpeed: (speed: Speed): void => {
      const radio = speeds.querySelector<HTMLInputElement>(`input[value="${speed}"]`)
      if (radio !== null) radio.checked = true
    },
    onSpeed: (handler: (speed: Speed) => void): void => {
      speeds.addEventListener('change', () => {
        handler(checkedSpeed())
      })
    },
    /** Hides everything but `shown`, for a browser that cannot run the worker. */
    showOnly: (shown: VisitorLine): void => {
      showOnly(PAGE, shown)
    },
    status: (line: string): void => {
      showLine(PAGE, line)
    },
    visitorLine: (shown: VisitorLine): void => {
      showVisitorLine(PAGE, shown)
    },
    /** A failure's visitor line; a run's failure names the place of the pick it plays. */
    failure: (error: unknown, place?: ReplayPlace): void => {
      showFailure(PAGE, error, place)
    },
    panel: findPanel(),
    /** The run's numbers for the developer, under "Details" (#59). */
    progress: (line: string): void => {
      if (progress.textContent === line) return
      progress.textContent = line
      fitDetails(progress)
    },
  }
}

export type WasmView = ReturnType<typeof findWasmView>
