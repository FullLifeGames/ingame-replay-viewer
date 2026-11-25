import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { BUILT_PORT, builtServerOptions } from './gen5-built'
import { GEN5_PATHS } from './gen5-paths'

describe('builtServerOptions', () => {
  it('binds to loopback on port 5184 unless told otherwise', () => {
    expect(BUILT_PORT).toBe(5184)
    expect(builtServerOptions(['--built'])).toEqual({ host: false, port: 5184 })
  })

  it('reads --host and --port', () => {
    expect(builtServerOptions(['--built', '--host', '--port', '5190'])).toEqual({
      host: true,
      port: 5190,
    })
  })

  it('refuses a port that is no port', () => {
    expect(() => builtServerOptions(['--port', 'abc'])).toThrow('port')
    expect(() => builtServerOptions(['--port', '70000'])).toThrow('port')
  })
})

// On 22.11.2026 a phone's file picker greyed out the Gen 3 dump because the input said
// accept=".gba" (src/web/pages.test.ts holds that rule for the Gen 3 pages). The spike page checks
// the header itself (src/gen5/nds-header.ts), so its input takes any file.
describe('the spike page', () => {
  const html = readFileSync(`${GEN5_PATHS.page}/index.html`, 'utf8')

  it('lets the picker offer any file', () => {
    const input = /<input id="dump"[^>]*>/.exec(html)?.[0]
    expect(input).toBeDefined()
    expect(input).not.toMatch(/accept/i)
  })

  it('shows the speed cap, the core switch, the copy button and the phone note', () => {
    for (const id of ['uncapped', 'core-switch', 'vsync-switch', 'copy', 'figures', 'phone-note']) {
      expect(html).toContain(`id="${id}"`)
    }
  })
})
