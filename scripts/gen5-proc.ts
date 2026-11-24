// Memory of the processes a Gen 5 spike run started (#72): the browser is a child of this Node
// process, so its renderer, GPU and utility processes are this process's descendants in /proc.
import { readdirSync, readFileSync } from 'node:fs'

export interface MemorySample {
  processes: number
  /** Sum of VmRSS over the descendants; counts shared pages once per process. */
  rssMb: number
  /** Sum of Pss over the descendants; shares shared pages out, so it does not double count. */
  pssMb: number
  /** The largest single process by RSS, which is the tab's renderer in practice. */
  largestRssMb: number
}

const KB_PER_MB = 1024

/** The parent PID from /proc/<pid>/stat; the command name in parentheses may hold spaces. */
export function parentOf(stat: string): number {
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  return Number(fields[1])
}

/** The kB value of `key` in a /proc status or smaps_rollup text, 0 if it is missing. */
export function kbField(text: string, key: string): number {
  const match = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text)
  return match ? Number(match[1]) : 0
}

const readOr = (path: string) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/** Every live descendant of `root`. */
export function descendants(root: number): number[] {
  const parents = new Map<number, number>()
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    const stat = readOr(`/proc/${name}/stat`)
    if (stat !== '') parents.set(Number(name), parentOf(stat))
  }
  const found: number[] = []
  const queue = [root]
  while (queue.length > 0) {
    const parent = queue.shift()
    for (const [pid, ppid] of parents) {
      if (ppid === parent) {
        found.push(pid)
        queue.push(pid)
      }
    }
  }
  return found
}

export function sampleMemory(root = process.pid): MemorySample {
  let rss = 0
  let pss = 0
  let largest = 0
  const pids = descendants(root)
  for (const pid of pids) {
    const own = kbField(readOr(`/proc/${String(pid)}/status`), 'VmRSS')
    rss += own
    largest = Math.max(largest, own)
    pss += kbField(readOr(`/proc/${String(pid)}/smaps_rollup`), 'Pss')
  }
  return {
    processes: pids.length,
    rssMb: Math.round(rss / KB_PER_MB),
    pssMb: Math.round(pss / KB_PER_MB),
    largestRssMb: Math.round(largest / KB_PER_MB),
  }
}

/** The 1, 5 and 15 minute load figures from a /proc/loadavg text; another session may run. */
export function loadAverage(text = readOr('/proc/loadavg')): string {
  return text.trim().split(/\s+/).slice(0, 3).join(' ')
}
