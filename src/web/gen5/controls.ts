// The spike page's controls for the user's own speed check (#72): the speed cap, the switches
// for the core and vsync (each reloads the page with the other address), and "Copy figures".
// src/gen5/pacing.ts reads the address; src/gen5/figures.ts builds the copied line.
import type { Gen5Hook } from '../../gen5/hook.ts'
import { type PageSettings, type PageSwitch, switchedQuery } from '../../gen5/pacing.ts'

type ControlHook = Pick<Gen5Hook, 'uncapped' | 'figures'>

function setText(selector: string, text: string): void {
  const line = document.querySelector(selector)
  if (line) line.textContent = text
}

function wireSwitch(selector: string, name: PageSwitch, text: string): void {
  const link = document.querySelector<HTMLAnchorElement>(selector)
  if (!link) return
  link.href = `${location.pathname}${switchedQuery(location.search, name)}`
  link.textContent = text
}

/** Copies the figures line, and shows it on the page in case the browser refuses the copy. */
async function copyFigures(hook: ControlHook): Promise<void> {
  const line = hook.figures()
  setText('#figures', line)
  try {
    await navigator.clipboard.writeText(line)
    setText('#copy', 'Copied: the line below')
  } catch {
    setText('#copy', 'Copy blocked: select the line below')
  }
}

export function wireControls(settings: PageSettings, hook: ControlHook): void {
  setText('#core-line', `You run the ${settings.threads ? 'thread' : 'plain'} core.`)
  wireSwitch(
    '#core-switch',
    'threads',
    settings.threads ? 'Switch to the plain core' : 'Switch to the thread core',
  )
  setText(
    '#vsync-line',
    settings.vsync
      ? "Vsync is on: each frame waits for your screen's next refresh."
      : 'Vsync is off: each frame starts as soon as the last one ends.',
  )
  wireSwitch('#vsync-switch', 'vsync', settings.vsync ? 'Turn vsync off' : 'Turn vsync on')
  const uncapped = document.querySelector<HTMLInputElement>('#uncapped')
  uncapped?.addEventListener('change', () => {
    hook.uncapped(uncapped.checked)
  })
  document.querySelector('#copy')?.addEventListener('click', () => void copyFigures(hook))
}
