// The page's DOM: the elements of emulator.html and what main.ts shows in them. It holds no rule of
// the flow; the replay controls and the list come from replay-view.ts.
import {
  element,
  findReplayView,
  showFailure,
  showLine,
  showOnly,
  showVisitorLine,
} from './replay-view'
import type { VisitorLine } from './visitor'

const PAGE = 'emulator.html'

/** The page's controls, and the calls that show the flow's state. */
export function findView() {
  return {
    ...findReplayView(PAGE),
    dump: element(PAGE, 'dump', HTMLInputElement),
    start: element(PAGE, 'start', HTMLButtonElement),
    restart: element(PAGE, 'restart', HTMLButtonElement),
    canvas: element(PAGE, 'screen', HTMLCanvasElement),
    /** Hides everything but `shown`, for a browser that cannot run the emulator. */
    showOnly: (shown: VisitorLine): void => {
      showOnly(PAGE, shown)
    },
    status: (line: string): void => {
      showLine(PAGE, line)
    },
    visitorLine: (shown: VisitorLine): void => {
      showVisitorLine(PAGE, shown)
    },
    failure: (error: unknown): void => {
      showFailure(PAGE, error)
    },
  }
}

export type View = ReturnType<typeof findView>
