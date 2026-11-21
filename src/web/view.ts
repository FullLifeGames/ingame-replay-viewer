// The page's DOM: the elements of index.html and what main.ts shows in them. It holds no rule of
// the flow; the texts come from status.ts.
import type { ReplaySummary } from './session'
import { countText, notShownHeading, replayLine, rowText } from './status'

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) throw new Error(`index.html lacks the ${type.name} #${id}`)
  return found
}

function fill(list: HTMLElement, texts: readonly string[]): void {
  list.replaceChildren(
    ...texts.map((text) => Object.assign(document.createElement('li'), { textContent: text })),
  )
}

/** The page's controls, and the calls that show the flow's state. */
export function findView() {
  const status = element('status', HTMLParagraphElement)
  const testReplay = element('test-replay', HTMLSelectElement)
  return {
    dump: element('dump', HTMLInputElement),
    testReplay,
    replayForm: element('replay-form', HTMLFormElement),
    replayInput: element('replay-input', HTMLInputElement),
    start: element('start', HTMLButtonElement),
    restart: element('restart', HTMLButtonElement),
    canvas: element('screen', HTMLCanvasElement),
    /** Hides everything but `line`, for a browser that cannot run the emulator. */
    showOnly: (line: string): void => {
      const environment = element('environment', HTMLParagraphElement)
      environment.textContent = line
      environment.hidden = false
      element('app', HTMLDivElement).hidden = true
    },
    status: (line: string): void => {
      status.textContent = line
    },
    offer: (ids: readonly string[], first: string): void => {
      testReplay.replaceChildren(...ids.map((id) => new Option(id, id, false, id === first)))
    },
    showReplay: (summary: ReplaySummary): void => {
      element('replay-summary', HTMLParagraphElement).textContent = replayLine(summary)
      element('not-shown', HTMLHeadingElement).textContent = notShownHeading(summary.rows.length)
      fill(element('not-shown-counts', HTMLUListElement), summary.counts.map(countText))
      fill(element('not-shown-rows', HTMLOListElement), summary.rows.map(rowText))
    },
  }
}

export type View = ReturnType<typeof findView>
