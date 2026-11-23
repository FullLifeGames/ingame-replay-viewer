import { describe, expect, it } from 'vitest'

import LICENSE from '../../LICENSE?raw'
import LICENCES from './public/licences.html?raw'
import { PLAYED_FORMATS } from './visitor'
import { pauseButton } from './wasm/pause'

// Every page in src/web, by its address: the viewer at index.html runs the WebAssembly build, and
// the emulator page at emulator.html is its fallback (U1 a, user 23.11.2026).
const FOUND = import.meta.glob<string>('./*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const VIEWER = 'index.html'
const EMULATOR = 'emulator.html'
const REPOSITORY = 'https://github.com/FullLifeGames/ingame-replay-viewer'

/** `text` with each run of whitespace as one space, so a licence reads the same in HTML. */
const squeezed = (text: string): string => text.replace(/\s+/g, ' ').trim()

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
// `accept` filter shuts the dump out. The page checks the dump by its SHA1 (rom.ts) and names, under
// "Details", the SHA1 of any other file it refuses, so the picker takes any file.
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

// #57: the viewer's third button pauses and plays the running replay. The page opens with the
// button as pause.ts shows it before the first run; the emulator page keeps Start and Restart.
describe('the pause button', () => {
  it('sits between Start and Restart on the viewer, as it reads before the first run', () => {
    const { label, disabled } = pauseButton(undefined)
    expect(disabled).toBe(true)
    expect(page(VIEWER)).toMatch(
      new RegExp(
        `<button id="start" type="button">Start</button>\\s*` +
          `<button id="pause" type="button" disabled>${label}</button>\\s*` +
          `<button id="restart" type="button">Restart</button>`,
      ),
    )
  })

  it('is not on the emulator page', () => {
    expect(page(EMULATOR)).not.toContain('id="pause"')
  })
})

// #59: the pages speak to visitors. The viewer's intro says what it does, what it needs, that
// nothing leaves the tab and which formats it plays; the module's own words sit in a "Details"
// disclosure that starts closed, and a failure's report link sits under the status line.
describe('the words for visitors', () => {
  for (const name of [VIEWER, EMULATOR]) {
    it(`labels the select "Example replay" on ${name}`, () => {
      expect(page(name)).toContain('<label for="test-replay">Example replay</label>')
      expect(page(name)).not.toMatch(/test replay/i)
    })

    it(`keeps the module's words inside a closed "Details" on ${name}`, () => {
      const details = /<details id="details">([\s\S]*?)<\/details>/.exec(page(name))
      expect(details?.[0]).toContain('<summary>Details</summary>')
      expect(details?.[1]).toContain('<p id="status-detail"></p>')
      expect(details?.[0]).not.toMatch(/<details[^>]*\bopen\b/)
    })

    // The report opens in a tab of its own, so the page keeps the dump and the run.
    it(`puts the report link under the status line on ${name}`, () => {
      expect(page(name)).toMatch(
        /<p id="status" role="status"><\/p>\s*<p><a id="report" target="_blank" rel="noopener" hidden>Report this problem<\/a><\/p>\s*<details id="details">/,
      )
    })

    // A replay ID or a file name has no space to break at; the phone's screen must not scroll.
    it(`wraps a long word in the status line, its detail and the summary on ${name}`, () => {
      expect(page(name)).toMatch(
        /#status,\s*#status-detail,\s*#replay-summary\s*\{\s*overflow-wrap: anywhere;\s*\}/,
      )
    })

    it(`gives the environment line its own "Details" and report link on ${name}`, () => {
      const block = /<div id="environment" hidden>([\s\S]*?)<\/div>/.exec(page(name))?.[1]
      expect(block).toContain('<p id="environment-line"></p>')
      expect(block).toContain(
        '<a id="environment-report" target="_blank" rel="noopener" hidden>Report this problem</a>',
      )
      expect(block).toMatch(
        /<details>\s*<summary>Details<\/summary>\s*<p id="environment-detail"><\/p>\s*<\/details>/,
      )
    })
  }

  it('moves the run\'s progress line into the viewer\'s "Details"', () => {
    const details = /<details id="details">([\s\S]*?)<\/details>/.exec(page(VIEWER))?.[1]
    expect(details).toContain('<p id="progress"></p>')
    expect(page(VIEWER).match(/id="progress"/g)).toHaveLength(1)
  })

  it('opens the viewer with an intro that names the formats and links the other pages', () => {
    const intro = /<h1>Ingame Replay Viewer<\/h1>([\s\S]*?)<div id="environment"/.exec(
      page(VIEWER),
    )?.[1]
    expect(intro).toContain(`The viewer plays ${PLAYED_FORMATS} for now.`)
    expect(intro).toContain('The page uploads nothing.')
    expect(intro).toContain('US Emerald')
    expect(intro).toContain('<a href="./licences.html">Licences</a>')
    expect(intro).toContain(`<a href="${REPOSITORY}">Source code</a>`)
    expect(intro).toContain(`<a href="./${EMULATOR}">`)
  })
})

// The licence page sits in src/web/public/, which Vite copies into the build as it stands.
describe('the licence page', () => {
  it("holds the repository's MIT licence word for word", () => {
    expect(squeezed(LICENCES)).toContain(squeezed(LICENSE))
  })

  it('names what the module carries and the libraries the pages run, with their licences', () => {
    for (const words of [
      'Emscripten 7.0.0',
      'musl',
      'setjmp',
      'pokeemerald-expansion',
      'MPL-2.0',
      'https://github.com/mgba-emu/mgba',
      'https://github.com/thenick775/mgba',
      '@thenick775/mgba-wasm',
      'https://github.com/pkmn/ps',
      `${REPOSITORY}/blob/master/docs/adr/0002-patch-for-user-supplied-rom.md`,
      `${REPOSITORY}/blob/master/docs/adr/0007-no-forks.md`,
    ]) {
      expect(LICENCES).toContain(words)
    }
    for (const library of ['client', 'data', 'dex', 'protocol']) {
      expect(LICENCES).toContain(`@pkmn/${library}`)
    }
  })

  it('links back to the viewer and names no machine of ours', () => {
    expect(LICENCES).toContain('<a href="./">')
    expect(LICENCES).not.toMatch(/localhost|devbox|tailscale|\/home\/|npm run|README/i)
  })
})
