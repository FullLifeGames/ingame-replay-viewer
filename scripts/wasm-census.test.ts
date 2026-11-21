import { describe, expect, it } from 'vitest'

import { classifyError, firstError, onBattlePath, renderCensus } from './wasm-census.ts'
import type { CensusEntry } from './wasm-census.ts'

const entry = (source: string, ok: boolean, stderr = ''): CensusEntry => ({
  source,
  ok,
  firstError: ok ? undefined : firstError(stderr, 1),
  rssKb: 70_000,
  seconds: 1.5,
})

describe('the first error of a failed compile', () => {
  it('takes the first line that carries an error, not a warning before it', () => {
    const stderr = [
      'include/global.h:38:9: warning: macro redefined',
      'src/random.c:47:13: error: unknown directive',
      'src/random.c:47:22: error: Expected integer, instead got: r4',
    ].join('\n')
    expect(firstError(stderr, 1)).toBe('src/random.c:47:13: error: unknown directive')
  })

  it('takes a fatal error too', () => {
    expect(firstError("src/x.c:1:10: fatal error: 'y.h' file not found", 1)).toMatch(/not found/)
  })

  it('names the exit code when no line carries an error', () => {
    expect(firstError('Killed\n', 137)).toBe('no error line (exit 137): Killed')
    expect(firstError('', null)).toBe('no error line (exit null)')
  })
})

describe('the error classes', () => {
  it.each([
    ['src/random.c:47:13: error: unknown directive', 'inline asm'],
    ['src/random.c:47:22: error: Expected integer, instead got: r4', 'inline asm'],
    ['src/m4a.c:316:9: error: invalid instruction', 'inline asm'],
    [
      "src/decompress.c:353:1: error: argument to 'section' attribute is not valid for this target",
      'section attribute',
    ],
    [
      "include/replay_interpreter.h:51:33: error: 'ReplayProgressSize' declared as an array with a negative size",
      'size assert',
    ],
    [
      "src/x.c:1:1: error: static assertion failed due to requirement 'sizeof(a) == 4'",
      'size assert',
    ],
    ["src/x.c:3:16: error: unknown attribute 'long_call' ignored", 'unknown attribute'],
    ["src/x.c:3:16: error: 'naked' attribute is not supported", 'naked function'],
    ["src/x.c:1:10: fatal error: 'gba/flash.h' file not found", 'missing header'],
    [
      "src/x.c:9:5: error: incompatible function pointer types assigning to 'void (*)(void)'",
      'function pointer type',
    ],
    ["src/x.c:9:5: error: call to undeclared function 'Foo'", 'implicit declaration'],
    ['src/x.c:9:5: error: incompatible integer to pointer conversion', 'integer and pointer'],
    [
      "src/script.c:623:26: error: incompatible pointer types passing 'intptr_t[5]' to parameter of type 'void **'",
      'pointer type',
    ],
    ['src/script.c:1:1: error: __builtin_setjmp is not supported for the current target', 'setjmp'],
    ['timed out after 1200 s', 'timeout'],
    ['no error line (exit 137): Killed', 'no error line'],
    ['src/x.c:9:5: error: something new', 'other'],
  ])('puts "%s" in the class %s', (line, name) => {
    expect(classifyError(line)).toBe(name)
  })
})

describe('the battle path', () => {
  it.each([['src/battle_main.c'], ['src/replay_boot.c'], ['src/pokemon.c'], ['src/m4a.c']])(
    'holds %s',
    (source) => {
      expect(onBattlePath(source)).toBe(true)
    },
  )

  it.each([['src/contest.c'], ['src/field_weather.c'], ['src/agb_flash.c']])(
    'leaves out %s',
    (source) => {
      expect(onBattlePath(source)).toBe(false)
    },
  )
})

describe('the census report', () => {
  const entries = [
    entry(
      'src/battle_main.c',
      false,
      "src/battle_main.c:1:1: error: 'x' declared as an array with a negative size",
    ),
    entry('src/contest.c', true),
    entry('src/random.c', false, 'src/random.c:47:13: error: unknown directive'),
    entry('src/agb_flash.c', false, 'src/agb_flash.c:5:5: error: unknown directive'),
  ]
  const report = renderCensus(entries, {
    excluded: ['src/agb_flash.c'],
    heading: 'emcc 7.0.0, -O0',
  })

  it('counts passes and failures, and the excluded files apart', () => {
    expect(report).toContain('4 files: 1 pass, 3 fail')
    expect(report).toContain('2 of the failures are on the battle path')
    expect(report).toContain('1 of the failures is a file that wasm.json excludes')
  })

  it('groups the failures by class with their files', () => {
    expect(report).toMatch(
      /\| inline asm \| 2 \| 1 \| src\/agb_flash\.c \(excluded\), src\/random\.c \|/,
    )
    expect(report).toMatch(/\| size assert \| 1 \| 1 \| src\/battle_main\.c \|/)
  })

  it('lists every file with its result and first error', () => {
    expect(report).toMatch(/\| src\/contest\.c \| pass \|/)
    expect(report).toMatch(/\| src\/random\.c \| fail \| inline asm \| yes \|.*unknown directive/)
  })

  it('names the largest compile by memory', () => {
    expect(report).toContain('largest compile: 68 MB')
  })
})
