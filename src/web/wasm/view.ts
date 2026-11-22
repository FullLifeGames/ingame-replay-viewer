// The DOM of the WebAssembly spike page: the elements of wasm.html and what main.ts shows in them.
import { SPEEDS, type Speed } from './protocol'

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) throw new Error(`wasm.html lacks the ${type.name} #${id}`)
  return found
}

const isSpeed = (value: string): value is Speed => (SPEEDS as readonly string[]).includes(value)

/** The page's controls, and the calls that show the run's state. */
export function findSpikeView() {
  const status = element('status', HTMLParagraphElement)
  const progress = element('progress', HTMLParagraphElement)
  const testReplay = element('test-replay', HTMLSelectElement)
  const speeds = element('speed', HTMLFieldSetElement)
  const checkedSpeed = (): Speed => {
    const value = speeds.querySelector<HTMLInputElement>('input:checked')?.value ?? '1x'
    return isSpeed(value) ? value : '1x'
  }
  return {
    dump: element('dump', HTMLInputElement),
    testReplay,
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
    offer: (ids: readonly string[], first: string): void => {
      testReplay.replaceChildren(...ids.map((id) => new Option(id, id, false, id === first)))
    },
  }
}

export type SpikeView = ReturnType<typeof findSpikeView>
