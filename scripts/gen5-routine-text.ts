// The text the direct entry's routine build reads (#97): the C file's order block and defines, and
// the ARM compiler's tools' output. Pure, so the specs run in CI, which has no ARM compiler (D7).

/** The routine's three proc functions in rom/gen5/routine.c, by their role in the proc table. */
export const PROC_FUNCTIONS = {
  init: 'RoutineProc_Init',
  main: 'RoutineProc_Main',
  exit: 'RoutineProc_Exit',
} as const

export type ProcRole = keyof typeof PROC_FUNCTIONS

/** Each proc function's byte offset in the code, from `nm` on the object. */
export function procOffsets(nm: string): Record<ProcRole, number> {
  const code = new Map<string, number>()
  for (const line of nm.split('\n')) {
    const [, value, name] = /^([0-9a-f]+) [Tt] (\S+)$/.exec(line.trim()) ?? []
    if (value !== undefined && name !== undefined) code.set(name, parseInt(value, 16) & ~1)
  }
  const offset = (name: string) => {
    const found = code.get(name)
    if (found === undefined) throw new Error(`the compiler's symbols hold no function ${name}`)
    return found
  }
  return {
    init: offset(PROC_FUNCTIONS.init),
    main: offset(PROC_FUNCTIONS.main),
    exit: offset(PROC_FUNCTIONS.exit),
  }
}

/** Throws unless `readelf -r` reports no relocation. */
export function refuseRelocations(readelf: string): void {
  if (readelf.includes('There are no relocations in this file.')) return
  const names = readelf
    .split('\n')
    .map((line) => /\bR_ARM_\w+\s+[0-9a-f]+\s+(\S+)/.exec(line)?.[1])
    .filter((name) => name !== undefined)
  throw new Error(
    `the routine holds a relocation (${names.join(', ') || 'unread output'}): its code must need no linker`,
  )
}

/** Throws on any symbol `nm -u` lists, and names a call into the compiler's library as one. */
export function refuseUndefined(nm: string): void {
  const names = nm
    .split('\n')
    .map((line) => /^U (\S+)$/.exec(line.trim())?.[1])
    .filter((name) => name !== undefined)
  const library = names.filter((name) => /^__(aeabi|gnu)_/.test(name))
  if (library.length > 0) {
    throw new Error(`the routine calls into the compiler's library (${library.join(', ')})`)
  }
  if (names.length > 0) throw new Error(`the routine names undefined symbols (${names.join(', ')})`)
}

/** The member names of the C struct `name`, each a `u32`, in their order. */
export function cStructMembers(source: string, name: string): string[] {
  const body = new RegExp(`typedef struct ${name} \\{\\n([\\s\\S]*?)\\n\\} ${name};`).exec(source)
  if (body?.[1] === undefined) throw new Error(`no struct ${name} in the routine's source`)
  return body[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'))
    .map((line) => {
      const member = /^(?:volatile )?u32 (\w+);$/.exec(line)?.[1]
      if (member === undefined) {
        throw new Error(`${name}: every member is one u32 word, not "${line}"`)
      }
      return member
    })
}

/** Throws unless the C struct's members and the TypeScript list are the same, in the same order. */
export function checkOrderMembers(c: readonly string[], ts: readonly string[]): void {
  const cAlone = c.filter((name) => !ts.includes(name))
  if (cAlone.length > 0) {
    throw new Error(`order members ${cAlone.join(', ')} sit in the C struct alone`)
  }
  const tsAlone = ts.filter((name) => !c.includes(name))
  if (tsAlone.length > 0) {
    throw new Error(`order members ${tsAlone.join(', ')} sit in the TypeScript list alone`)
  }
  const moved = c.find((name, i) => ts[i] !== name)
  if (moved !== undefined) throw new Error(`the order members' order differs from ${moved} on`)
}

/** The `#define <prefix>NAME n` lines of `source`, by NAME. */
export function cDefines(source: string, prefix: string): Record<string, number> {
  const defines: Record<string, number> = {}
  for (const [, name, value] of source.matchAll(
    new RegExp(`^#define ${prefix}(\\w+) (\\d+)\\b`, 'gm'),
  )) {
    if (name !== undefined) defines[name] = Number(value)
  }
  return defines
}

/** Numeric literals at or above this bound mark a number that has no place in the routine's source:
 * its stages and its few small values stay below it. */
export const LITERAL_BOUND = 16

/** Every numeric literal of `source`, comments included, at or above `bound`. */
export function literalsAbove(source: string, bound: number): string[] {
  return [...source.matchAll(/\b(?:0[xX][0-9a-fA-F]+|\d+)\b/g)]
    .map((match) => match[0])
    .filter((literal) => Number(literal) >= bound)
}

/** Throws unless the two builds' bytes are the same. */
export function refuseDiffering(first: Uint8Array, second: Uint8Array): void {
  const same = first.length === second.length && first.every((byte, i) => byte === second[i])
  if (!same) throw new Error("the routine's two runs differ: its build is not reproducible")
}
