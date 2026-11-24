// Where a frame's time goes in the spike page (#72): a CPU profile of the page's main thread
// through the Chrome DevTools Protocol, summed by self time. The core is wasm; WebGL and
// EmulatorJS are JavaScript; "(idle)" is time the thread waited, for the next animation frame
// or for a worker.
import type { Page } from '@playwright/test'

export interface ProfileNode {
  callFrame: { functionName: string; url: string }
  hitCount?: number
}

const ENGINE: Record<string, string> = {
  '(idle)': 'idle',
  '(program)': 'program',
  '(garbage collector)': 'gc',
  '(root)': 'root',
}
const KINDS = ['wasm', 'js', 'idle', 'program', 'gc']

/** A module without a name section shows its functions as wasm-function[N], whatever its URL. */
const isWasm = (frame: ProfileNode['callFrame']) =>
  frame.url.startsWith('wasm://') || frame.functionName.startsWith('wasm-function[')

const kindOf = (frame: ProfileNode['callFrame']) =>
  ENGINE[frame.functionName] ?? (isWasm(frame) ? 'wasm' : 'js')

const share = (part: number, total: number) => `${((100 * part) / total).toFixed(1)}%`

function add(map: Map<string, number>, key: string, count: number): void {
  map.set(key, (map.get(key) ?? 0) + count)
}

/** One line of self time by kind, then the `top` functions by self time. */
export function selfTimeLines(nodes: readonly ProfileNode[], top: number): string[] {
  const kinds = new Map<string, number>()
  const functions = new Map<string, number>()
  let total = 0
  for (const { callFrame, hitCount = 0 } of nodes) {
    const kind = kindOf(callFrame)
    total += hitCount
    add(kinds, kind, hitCount)
    if (!(callFrame.functionName in ENGINE)) {
      add(functions, `${callFrame.functionName || '(anonymous)'} [${kind}]`, hitCount)
    }
  }
  if (total === 0) return ['self time: no samples']
  const byKind = KINDS.map((kind) => `${kind} ${share(kinds.get(kind) ?? 0, total)}`).join(', ')
  const ranked = [...functions].sort((a, b) => b[1] - a[1]).slice(0, top)
  return [
    `self time over ${String(total)} samples: ${byKind}`,
    ...ranked.map(([name, count]) => `  ${share(count, total)} ${name}`),
  ]
}

/** Profiles the page's main thread for `seconds` and sums it. */
export async function profileFor(page: Page, seconds: number): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.start')
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  const { profile } = await cdp.send('Profiler.stop')
  await cdp.detach()
  return selfTimeLines(profile.nodes, 12)
}
