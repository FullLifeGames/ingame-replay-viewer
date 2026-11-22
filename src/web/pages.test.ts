import { describe, expect, it } from 'vitest'

import indexHtml from './index.html?raw'
import wasmHtml from './wasm.html?raw'

// The user reported on 22.11.2026 that a phone would not let them pick their dump. Phone file
// pickers grey out files whose extension they cannot map to a type, and `.gba` maps to none, so an
// `accept` filter shuts the dump out. The page checks the dump by its SHA1 (rom.ts) and names the
// SHA1 of any other file it refuses, so the picker takes any file.
const PAGES: Record<string, string> = { 'index.html': indexHtml, 'wasm.html': wasmHtml }

function dumpInput(page: string, html: string): string {
  const input = /<input id="dump"[^>]*>/.exec(html)
  if (input === null) throw new Error(`${page} has no dump input`)
  return input[0]
}

describe('the dump input', () => {
  for (const [page, html] of Object.entries(PAGES)) {
    it(`takes any file on ${page}`, () => {
      const input = dumpInput(page, html)
      expect(input).toContain('type="file"')
      expect(input).not.toContain('accept=')
    })
  }
})

// #52: the WebAssembly page loads a replay by link and lists what the game does not show, with the
// ids, labels and texts of the emulator page, so both pages share replay-view.ts.
const REPLAY_PARTS: Record<string, RegExp> = {
  'the replay form': /<form id="replay-form">[\s\S]*?<\/form>/,
  'the list': /<p id="replay-summary"><\/p>[\s\S]*?<ol id="not-shown-rows"><\/ol>/,
}

describe('the replay form and the "Not shown" list', () => {
  for (const [part, pattern] of Object.entries(REPLAY_PARTS)) {
    it(`reads the same on both pages: ${part}`, () => {
      const onIndex = pattern.exec(indexHtml)?.[0]
      expect(onIndex).toBeDefined()
      expect(pattern.exec(wasmHtml)?.[0]).toBe(onIndex)
    })
  }
})
