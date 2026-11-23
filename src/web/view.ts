// The page's DOM: the elements of emulator.html and what main.ts shows in them. It holds no rule of
// the flow; the replay controls and the list come from replay-view.ts.
import { element, findReplayView } from './replay-view'

const PAGE = 'emulator.html'

/** The page's controls, and the calls that show the flow's state. */
export function findView() {
  const status = element(PAGE, 'status', HTMLParagraphElement)
  return {
    ...findReplayView(PAGE),
    dump: element(PAGE, 'dump', HTMLInputElement),
    start: element(PAGE, 'start', HTMLButtonElement),
    restart: element(PAGE, 'restart', HTMLButtonElement),
    canvas: element(PAGE, 'screen', HTMLCanvasElement),
    /** Hides everything but `line`, for a browser that cannot run the emulator. */
    showOnly: (line: string): void => {
      const environment = element(PAGE, 'environment', HTMLParagraphElement)
      environment.textContent = line
      environment.hidden = false
      element(PAGE, 'app', HTMLDivElement).hidden = true
    },
    status: (line: string): void => {
      status.textContent = line
    },
  }
}

export type View = ReturnType<typeof findView>
