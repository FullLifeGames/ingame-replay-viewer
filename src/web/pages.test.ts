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
