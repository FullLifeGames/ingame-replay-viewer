// The viewer's DOM: the elements of index.html and what main.ts shows in them.
// The replay controls and the list come from replay-view.ts, as on the emulator page.
import { element as pageElement, findReplayView } from '../replay-view'
import { SPEEDS, type Speed } from './protocol'

const PAGE = 'index.html'

const element = <T extends HTMLElement>(id: string, type: new () => T): T =>
  pageElement(PAGE, id, type)

const isSpeed = (value: string): value is Speed => (SPEEDS as readonly string[]).includes(value)

/** The page's controls, and the calls that show the run's state. */
export function findSpikeView() {
  const status = element('status', HTMLParagraphElement)
  const progress = element('progress', HTMLParagraphElement)
  const speeds = element('speed', HTMLFieldSetElement)
  const checkedSpeed = (): Speed => {
    const value = speeds.querySelector<HTMLInputElement>('input:checked')?.value ?? '1x'
    return isSpeed(value) ? value : '1x'
  }
  return {
    ...findReplayView(PAGE),
    dump: element('dump', HTMLInputElement),
    replayFile: element('replay-file', HTMLInputElement),
    start: element('start', HTMLButtonElement),
    restart: element('restart', HTMLButtonElement),
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
    /** Hides everything but `line`, for a browser that cannot run the worker. */
    showOnly: (line: string): void => {
      const environment = element('environment', HTMLParagraphElement)
      environment.textContent = line
      environment.hidden = false
      element('app', HTMLDivElement).hidden = true
    },
    status: (line: string): void => {
      status.textContent = line
    },
    progress: (line: string): void => {
      if (progress.textContent !== line) progress.textContent = line
    },
  }
}

export type SpikeView = ReturnType<typeof findSpikeView>
