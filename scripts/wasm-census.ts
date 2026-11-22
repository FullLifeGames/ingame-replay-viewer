// The compile census of the WebAssembly spike (#35, plan B1): every C file of the tree once through
// emcc, each with its result, its first error and its class, so B3 knows which fix each failure
// needs (per-file flag, shadow header, exclusion with a replacement, overlay patch).

export interface CensusEntry {
  source: string
  ok: boolean
  firstError: string | undefined
  rssKb: number
  seconds: number
}

export interface CensusMeta {
  excluded: readonly string[]
  heading: string
}

const ERROR_LINE = /\b(?:fatal )?error:/

export function firstError(stderr: string, exitCode: number | null): string {
  const lines = stderr.split('\n').filter((line) => line.trim() !== '')
  const found = lines.find((line) => ERROR_LINE.test(line))
  if (found !== undefined) return found
  const last = lines.at(-1)
  return `no error line (exit ${String(exitCode)})${last === undefined ? '' : `: ${last}`}`
}

// The first matching class wins; `other` takes what none names, and the census shows it.
const CLASSES: readonly (readonly [string, RegExp])[] = [
  ['timeout', /^timed out/],
  ['no error line', /^no error line/],
  ['missing header', /file not found/],
  ['inline asm', /unknown directive|instead got|invalid instruction|inline asm|invalid operand/],
  ['section attribute', /\bsection\b/],
  ['size assert', /negative size|static assert|static_assert/],
  ['unknown attribute', /unknown attribute/],
  ['naked function', /naked/],
  ['function pointer type', /incompatible function pointer/],
  ['implicit declaration', /undeclared function|implicit declaration/],
  ['integer and pointer', /incompatible (?:integer|pointer) to (?:integer|pointer)/],
  ['pointer type', /incompatible pointer types/],
  ['setjmp', /setjmp|longjmp/],
]

export function classifyError(line: string): string {
  const message = line.replace(/^.*?\b(?:fatal )?error:\s*/, '')
  return CLASSES.find(([, pattern]) => pattern.test(message))?.[0] ?? 'other'
}

// By name: the battle and what every frame of it runs (main loop, memory, graphics, text, sound,
// the replay files). A whole-program link needs every file that is not excluded all the same; this
// only says which failures block the battle first. Frontier facilities and link battles stay out.
const BATTLE_PATH = new RegExp(
  '^src/(?:' +
    [
      'battle_(?!arena|debug|dome|factory|frontier|palace|pike|pyramid|records|tent|tower|tv|controller_link)',
      'replay_',
      'pokemon(?:_animation|_icon)?\\.c',
      'pokeball',
      'trainer_pokemon_sprites',
      'main\\.c',
      'malloc',
      'bg\\.c',
      'blit',
      'gpu_regs',
      'dma3_manager',
      'io_reg',
      'sprite',
      'palette',
      'decompress',
      'text\\.c',
      'text_window',
      'window',
      'fonts',
      'strings\\.c',
      'string_util',
      'international_string_util',
      'm4a',
      'sound',
      'random\\.c',
      'task',
      'scanline_effect',
      'data\\.c',
      'graphics\\.c',
      'item\\.c',
      'move\\.c',
      'trig',
      'math_util',
      'util\\.c',
      'caps',
      'reshow_battle_screen',
      'type_icons',
    ].join('|') +
    ')',
)

export function onBattlePath(source: string): boolean {
  return BATTLE_PATH.test(source)
}

const cell = (text: string) => text.replaceAll('|', '\\|')
const mb = (kb: number) => Math.round(kb / 1024)

function classesOf(entries: readonly CensusEntry[]): Map<string, CensusEntry[]> {
  const groups = new Map<string, CensusEntry[]>()
  for (const failed of entries.filter((item) => !item.ok)) {
    const name = classifyError(failed.firstError ?? '')
    groups.set(name, [...(groups.get(name) ?? []), failed])
  }
  return groups
}

function summary(entries: readonly CensusEntry[], meta: CensusMeta): string[] {
  const failed = entries.filter((item) => !item.ok)
  const battle = failed.filter((item) => onBattlePath(item.source))
  const excluded = failed.filter((item) => meta.excluded.includes(item.source))
  const largest = [...entries].sort((a, b) => b.rssKb - a.rssKb)[0]
  const seconds = entries.reduce((sum, item) => sum + item.seconds, 0)
  return [
    `- ${String(entries.length)} files: ${String(entries.length - failed.length)} pass, ${String(failed.length)} fail.`,
    `- ${String(battle.length)} of the failures are on the battle path (by name, see wasm-census.ts).`,
    `- ${String(excluded.length)} of the failures ${excluded.length === 1 ? 'is a file' : 'are files'} that wasm.json excludes.`,
    `- largest compile: ${String(mb(largest?.rssKb ?? 0))} MB (${largest?.source ?? 'none'}); compile time summed over files: ${String(Math.round(seconds))} s.`,
  ]
}

function classTable(entries: readonly CensusEntry[], meta: CensusMeta): string[] {
  const rows = [...classesOf(entries)].sort((a, b) => b[1].length - a[1].length)
  const name = (item: CensusEntry) =>
    meta.excluded.includes(item.source) ? `${item.source} (excluded)` : item.source
  return [
    '| Class | Files | On the battle path | Files |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      ([label, items]) =>
        `| ${label} | ${String(items.length)} | ${String(items.filter((item) => onBattlePath(item.source)).length)} | ${items.map(name).sort().join(', ')} |`,
    ),
  ]
}

function fileTable(entries: readonly CensusEntry[]): string[] {
  return [
    '| File | Result | Class | Battle path | MB | s | First error |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...[...entries]
      .sort((a, b) => a.source.localeCompare(b.source))
      .map((item) => {
        const label = item.ok ? '' : classifyError(item.firstError ?? '')
        return `| ${item.source} | ${item.ok ? 'pass' : 'fail'} | ${label} | ${onBattlePath(item.source) ? 'yes' : 'no'} | ${String(mb(item.rssKb))} | ${item.seconds.toFixed(1)} | ${cell(item.firstError ?? '')} |`
      }),
  ]
}

export function renderCensus(entries: readonly CensusEntry[], meta: CensusMeta): string {
  return [
    '# WebAssembly compile census',
    '',
    meta.heading,
    '',
    ...summary(entries, meta),
    '',
    '## Failures by class',
    '',
    ...classTable(entries, meta),
    '',
    '## Every file',
    '',
    ...fileTable(entries),
    '',
  ].join('\n')
}
