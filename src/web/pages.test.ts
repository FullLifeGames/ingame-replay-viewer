import { describe, expect, it } from 'vitest'

// Every page in src/web, by its address: the viewer at index.html runs the WebAssembly build, and
// the emulator page at emulator.html is its fallback (U1 a, user 23.11.2026).
const FOUND = import.meta.glob<string>('./*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const VIEWER = 'index.html'
const EMULATOR = 'emulator.html'

function page(name: string): string {
  const html = FOUND[`./${name}`]
  if (html === undefined) throw new Error(`src/web has no ${name}`)
  return html
}

describe('the pages', () => {
  it('are the viewer and the emulator page, and no other', () => {
    expect(Object.keys(FOUND).sort()).toEqual([`./${EMULATOR}`, `./${VIEWER}`])
  })

  it('run the WebAssembly build in the viewer and mGBA on the emulator page', () => {
    expect(page(VIEWER)).toContain('<script type="module" src="./wasm/main.ts"></script>')
    expect(page(EMULATOR)).toContain('<script type="module" src="./main.ts"></script>')
  })

  it('link the viewer to the emulator page as the fallback, and the emulator page back', () => {
    expect(page(VIEWER)).toContain(`<a href="./${EMULATOR}">`)
    expect(page(EMULATOR)).toContain('<a href="./">')
  })

  it('say "spike" in none of their words', () => {
    for (const name of [VIEWER, EMULATOR]) expect(page(name)).not.toMatch(/spike/i)
  })
})

// The user reported on 22.11.2026 that a phone would not let them pick their dump. Phone file
// pickers grey out files whose extension they cannot map to a type, and `.gba` maps to none, so an
// `accept` filter shuts the dump out. The page checks the dump by its SHA1 (rom.ts) and names the
// SHA1 of any other file it refuses, so the picker takes any file.
function dumpInput(name: string): string {
  const input = /<input id="dump"[^>]*>/.exec(page(name))
  if (input === null) throw new Error(`${name} has no dump input`)
  return input[0]
}

describe('the dump input', () => {
  for (const name of [VIEWER, EMULATOR]) {
    it(`takes any file on ${name}`, () => {
      const input = dumpInput(name)
      expect(input).toContain('type="file"')
      expect(input).not.toContain('accept=')
    })
  }
})

// #52: the viewer loads a replay by link and lists what the game does not show, with the ids,
// labels and texts of the emulator page, so both pages share replay-view.ts.
const REPLAY_PARTS: Record<string, RegExp> = {
  'the replay form': /<form id="replay-form">[\s\S]*?<\/form>/,
  'the list': /<p id="replay-summary"><\/p>[\s\S]*?<ol id="not-shown-rows"><\/ol>/,
}

describe('the replay form and the "Not shown" list', () => {
  for (const [part, pattern] of Object.entries(REPLAY_PARTS)) {
    it(`reads the same on both pages: ${part}`, () => {
      const onEmulator = pattern.exec(page(EMULATOR))?.[0]
      expect(onEmulator).toBeDefined()
      expect(pattern.exec(page(VIEWER))?.[0]).toBe(onEmulator)
    })
  }
})

// #56: the viewer reads a replay from a saved file. Its input sits outside the replay form, so the
// form reads the same on both pages, and takes any file, as the dump input does: the reader tells
// the kinds apart by their text. The emulator page keeps the link form and the test replays.
describe('the replay file input', () => {
  it('takes any file on the viewer, outside the replay form', () => {
    const input = /<input id="replay-file"[^>]*>/.exec(page(VIEWER))?.[0]
    expect(input).toBeDefined()
    expect(input).toContain('type="file"')
    expect(input).not.toContain('accept=')
    expect(REPLAY_PARTS['the replay form']?.exec(page(VIEWER))?.[0]).not.toContain('replay-file')
  })

  it('is not on the emulator page', () => {
    expect(page(EMULATOR)).not.toContain('replay-file')
  })
})
