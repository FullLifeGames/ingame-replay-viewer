// What a Gen 5 run (#72, #78) lets the page ask for. Every request is logged. One that leaves the
// machine is aborted; one whose method is not GET or HEAD, or that carries a body, is a fault, so
// neither the dump nor a state nor a save leaves the tab. On the built page a websocket or Vite's
// dev client is a fault too. Each fault fails the run, and the run's log ends with one line on its
// requests. At the end the run lists the origin's IndexedDB databases: none may hold the save
// folder. scripts/gen5-shot.ts, scripts/gen5-route.ts and scripts/gen5-moment.ts use it.
import type { Page } from '@playwright/test'

import { SAVE_FOLDER } from '../src/gen5/save-file.ts'
import { log } from './gen5-page.ts'

/** Local: the page's own origin, or a blob: or data: URL the page made itself. */
export function isLocalRequest(url: string, origin: string): boolean {
  return url.startsWith(`${origin}/`) || url.startsWith('blob:') || url.startsWith('data:')
}

/** A request as the run sees it; `bodyBytes` is undefined when it carries no body. */
export interface SeenRequest {
  method: string
  url: string
  bodyBytes: number | undefined
}

/** Why a request fails the run, or undefined when it may be made. */
export function requestFault(request: SeenRequest, built: boolean): string | undefined {
  const { method, url, bodyBytes } = request
  if (method !== 'GET' && method !== 'HEAD') return `${method} ${url}: not GET or HEAD`
  if (bodyBytes !== undefined)
    return `${method} ${url}: carries a body of ${String(bodyBytes)} bytes`
  if (built && url.includes('/@vite/')) return `${method} ${url}: the dev client on the built page`
  return undefined
}

/** The run's requests: how many it saw and the faults among them. */
export class RequestLog {
  private count = 0
  private readonly faults: string[] = []
  private readonly built: boolean

  constructor(built: boolean) {
    this.built = built
  }

  get failed(): boolean {
    return this.faults.length > 0
  }

  /** Counts a request; returns its fault, if it is one. */
  seen(request: SeenRequest): string | undefined {
    this.count += 1
    const fault = requestFault(request, this.built)
    if (fault !== undefined) this.faults.push(fault)
    return fault
  }

  refuse(url: string, why: string): void {
    this.faults.push(`${url}: ${why}`)
  }

  /** A websocket, which only the built page refuses (Vite's dev server keeps one open). */
  socket(url: string): void {
    if (this.built) this.refuse(url, 'a websocket on the built page')
  }

  summary(): string {
    const seen = `requests: ${String(this.count)} seen`
    if (this.failed) {
      const faults = `${String(this.faults.length)} fault${this.faults.length === 1 ? '' : 's'}`
      return `${seen}, ${faults}: ${this.faults.join('; ')}`
    }
    return `${seen}, all local, none with a body${this.built ? ', no websocket, no dev client' : ''}`
  }
}

/** Logs every request, websocket, console line and page error; aborts a request that leaves the
 * machine. The returned log holds the faults. */
export function watchRequests(page: Page, origin: string, built: boolean): RequestLog {
  const requests = new RequestLog(built)
  page.on('request', (request) => {
    const body = request.postDataBuffer()
    const fault = requests.seen({
      method: request.method(),
      url: request.url(),
      bodyBytes: body === null ? undefined : body.length,
    })
    log(
      `request ${request.method()} ${request.url()}${body === null ? '' : ` body ${String(body.length)} bytes`}`,
    )
    if (fault !== undefined) log(`FAULT ${fault}`)
  })
  page.on('websocket', (socket) => {
    log(`websocket ${socket.url()}`)
    requests.socket(socket.url())
  })
  page.on('console', (message) => {
    log(`console ${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    log(`pageerror ${error.message}`)
  })
  void page.context().route('**/*', async (route) => {
    const url = route.request().url()
    if (isLocalRequest(url, origin)) return route.continue()
    requests.refuse(url, 'off the machine')
    log(`ABORTED off-machine request ${url}`)
    return route.abort()
  })
  return requests
}

/** The line on the origin's IndexedDB databases at a run's end, and whether none holds saves. */
export function storageCheck(names: readonly string[]): { line: string; clean: boolean } {
  const line = `indexedDB at the end: ${names.length === 0 ? 'none' : names.join(', ')}`
  const clean = !names.includes(SAVE_FOLDER)
  return { line: clean ? line : `${line}; FAULT: the save folder is in IndexedDB`, clean }
}

/** IndexedDB as far as the page's databases list goes; the scripts have no DOM types. */
interface PageStorage {
  indexedDB: { databases: () => Promise<{ name?: string }[]> }
}

/** Logs the names of the origin's IndexedDB databases; false when one holds the save folder or
 * the list cannot be read. */
export async function logStorage(page: Page): Promise<boolean> {
  try {
    const names = await page.evaluate(async () => {
      const list = await (globalThis as unknown as PageStorage).indexedDB.databases()
      return list.map((database) => database.name ?? '')
    })
    const { line, clean } = storageCheck(names)
    log(line)
    return clean
  } catch (error) {
    log(`indexedDB at the end: unread (${String(error)}); FAULT`)
    return false
  }
}
