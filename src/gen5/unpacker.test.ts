import { describe, expect, it } from 'vitest'

import { emulatorPaths, UNPACKER_PATH } from './unpacker'

// Scene: EmulatorJS looks up EJS_paths by a file's last path segment (emulator.js, downloadFile).
describe('emulatorPaths', () => {
  const lookUp = (dataPath: string, file: string) =>
    emulatorPaths()[`${dataPath}${file}`.split('/').pop() ?? '']

  it("resolves EmulatorJS's 7z unpacker to the page's own worker script", () => {
    expect(lookUp('/emulatorjs/data/', 'compression/extract7z.js')).toBe(UNPACKER_PATH)
    expect(UNPACKER_PATH).toMatch(/^\/[a-z0-9-]+\.js$/)
  })

  it('leaves every other file of EmulatorJS where it is', () => {
    for (const file of ['loader.js', 'src/emulator.js', 'compression/extractzip.js'])
      expect(lookUp('/emulatorjs/data/', file)).toBeUndefined()
    expect(Object.keys(emulatorPaths())).toEqual(['extract7z.js'])
  })
})
