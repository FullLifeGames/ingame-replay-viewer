// P2 (pinned tree): every tagged phrase template renders the string of the pinned
// `battle_message.c` it names, with the placeholders filled for the same scene (plan §5, D2). The
// file is read in place and nothing of it is written anywhere.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { gens, names } from '../src/gen3/tables/testing.ts'
import type { AnyTemplate } from '../src/gen3/text/template.ts'
import { defaultFill, FAR, type Sample, SAMPLES, TEMPLATE_GROUPS } from './gen3-phrase-samples.ts'
import { readerTree } from './rom-paths.ts'

const TEMPLATES: ReadonlyMap<string, AnyTemplate> = new Map(
  Object.entries(TEMPLATE_GROUPS).flatMap(([group, templates]) =>
    Object.entries(templates).map(([name, template]): [string, AnyTemplate] => [
      `${group}.${name}`,
      template,
    ]),
  ),
)

/** The concatenated C string literals of `source`, escapes left as written. */
const literals = (source: string) =>
  [...source.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join('')

const STRINGS = String.raw`((?:\s*"(?:[^"\\]|\\.)*")+)`
const TEXT_ARRAY = new RegExp(String.raw`const u8 ([sg]Text_\w+)\[\] = _\(${STRINGS}\s*\);`, 'g')
const TABLE_ENTRY = new RegExp(
  String.raw`\[(STRINGID_\w+)\]\s*=\s*(?:COMPOUND_STRING\(${STRINGS}\s*\)|([sg]Text_\w+))\s*,`,
  'g',
)

/** `STRINGID_*` and `sText_*`/`gText_*` to their strings, as written in the C file. */
function readMessages(file: string): ReadonlyMap<string, string> {
  const texts = new Map<string, string>()
  for (const [, id = '', source = ''] of file.matchAll(TEXT_ARRAY)) texts.set(id, literals(source))
  for (const [, id = '', source = '', alias] of file.matchAll(TABLE_ENTRY)) {
    const text = alias === undefined ? literals(source) : texts.get(alias)
    if (text !== undefined && !texts.has(id)) texts.set(id, text)
  }
  return texts
}

/** The pinned string as one PRINT shows it: placeholders filled, pauses and sounds gone. */
function renderPinned(text: string, fill: (placeholder: string) => string | undefined) {
  return text
    .replace(/\{(?:PAUSE \d+|WAIT_SE|PLAY_SE \w+)\}/g, '')
    .replace(/(?:\\[pnl])+$/, '')
    .replace(/\\[pnl]/g, ' ')
    .replace(/\{(B_\w+)\}/g, (whole, placeholder: string) => fill(placeholder) ?? whole)
}

function sampleOf(key: string, template: AnyTemplate): Sample {
  const sample = SAMPLES[key]
  if (sample !== undefined) return sample
  return { args: template.render.length === 0 ? [] : [FAR] }
}

const render = (template: AnyTemplate, args: readonly unknown[]) =>
  (template.render as (...values: readonly unknown[]) => string)(...args)

describe('the phrase samples', () => {
  it('name only tagged templates', () => {
    expect([...Object.keys(SAMPLES)].filter((key) => !TEMPLATES.has(key))).toEqual([])
  })

  it('cover each template that takes more than one argument', () => {
    const missing = [...TEMPLATES].filter(
      ([key, template]) => template.render.length > 1 && SAMPLES[key] === undefined,
    )
    expect(missing.map(([key]) => key)).toEqual([])
  })

  it('fill placeholders in a pinned string, and drop pauses and paragraph ends', () => {
    const text = renderPinned(
      '{PAUSE 16}{B_ATK_NAME_WITH_PREFIX} fainted!\\p{B_UNKNOWN}',
      (name) => (name === 'B_ATK_NAME_WITH_PREFIX' ? 'Dugtrio' : undefined),
    )
    expect(text).toBe('Dugtrio fainted! {B_UNKNOWN}')
  })

  it('read table entries, aliases and text arrays of the C file', () => {
    const file = [
      'static const u8 sText_GoPkmn2[] = _("Go! {B_BUFF1}!");',
      'const u8 gText_StatSharply[] = _(" sharply");',
      '    [STRINGID_STATSHARPLY]   = gText_StatSharply,',
      '    [STRINGID_CRITICALHIT]   = COMPOUND_STRING("A critical " "hit!"),',
    ].join('\n')
    expect(Object.fromEntries(readMessages(file))).toEqual({
      sText_GoPkmn2: 'Go! {B_BUFF1}!',
      gText_StatSharply: ' sharply',
      STRINGID_STATSHARPLY: ' sharply',
      STRINGID_CRITICALHIT: 'A critical hit!',
    })
  })
})

const file = join(readerTree(), 'src', 'battle_message.c')

describe.skipIf(!existsSync(file))(
  'the tagged phrases against the pinned strings (P2, pinned tree)',
  () => {
    let messages: ReadonlyMap<string, string> | undefined
    const pinnedOf = (id: string) => {
      messages ??= readMessages(readFileSync(file, 'utf8'))
      return messages.get(id)
    }

    it.each([...TEMPLATES])('%s renders its pinned string', (key, template) => {
      const pinned = pinnedOf(template.id)
      expect(pinned, `${template.id} in battle_message.c`).toBeDefined()
      const sample = sampleOf(key, template)
      const fill = (placeholder: string) => sample.fill?.[placeholder] ?? defaultFill(placeholder)
      expect(render(template, sample.args)).toBe(renderPinned(pinned ?? '', fill))
    })
  },
)

const typesFile = join(readerTree(), 'src', 'data', 'types_info.h')

/** The names `types_info.h` gives its types, as written in the C file. */
const typeNames = (source: string) =>
  [...source.matchAll(/\.name\s*=\s*_\("([^"]*)"\)/g)].map((m) => m[1])

// A Terastallization prints the type the log names (#88), so each Gen 9 type @pkmn reads must be
// the name the game gives it (D16).
describe.skipIf(!existsSync(typesFile))('the type names against the pinned tree (#88)', () => {
  it('holds every Gen 9 type of @pkmn, Stellar included, as the game names it', () => {
    const pkmn = names(gens.get(9).types)
    expect(pkmn).toContain('Stellar')
    const pinned = new Set(typeNames(readFileSync(typesFile, 'utf8')))
    expect(pkmn.filter((name) => !pinned.has(name))).toEqual([])
  })
})
