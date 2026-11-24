import { describe, expect, it } from 'vitest'

import { checkBlack2, HEADER_SIZE, readNdsHeader } from './nds-header'

const ascii = (bytes: Uint8Array, offset: number, text: string) => {
  bytes.set(new TextEncoder().encode(text), offset)
}

/** A synthetic DS header: only the fields the reader looks at are filled. */
function syntheticHeader(gameCode: string, version = 0): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE)
  const view = new DataView(bytes.buffer)
  ascii(bytes, 0x00, 'POKEMON TEST')
  ascii(bytes, 0x0c, gameCode)
  ascii(bytes, 0x10, '01')
  bytes[0x12] = 0x02
  bytes[0x1e] = version
  view.setUint32(0x20, 0x4000, true)
  view.setUint32(0x28, 0x02004000, true)
  view.setUint32(0x2c, 0x736a4, true)
  view.setUint32(0x80, 0x11831a00, true)
  view.setUint16(0x90, 0x0231, true)
  view.setUint32(0x210, 0x118ec400, true)
  return bytes
}

describe('readNdsHeader', () => {
  it('reads back the fields of a DSi-enhanced header', () => {
    expect(readNdsHeader(syntheticHeader('IREO'))).toEqual({
      title: 'POKEMON TEST',
      gameCode: 'IREO',
      makerCode: '01',
      unitCode: 0x02,
      romVersion: 0,
      arm9RomOffset: 0x4000,
      arm9RamAddress: 0x02004000,
      arm9Size: 0x736a4,
      ntrUsedSize: 0x11831a00,
      twlRegionStart: 0x11880000,
      twlUsedSize: 0x118ec400,
    })
  })

  it('throws on a buffer shorter than a header', () => {
    expect(() => readNdsHeader(new Uint8Array(0x100))).toThrow('256 bytes')
  })
})

// Scene: a visitor picks White 2, Black or a cut file, and the page says what it found.
describe('checkBlack2', () => {
  it('accepts Black 2 (USA), version 0', () => {
    const check = checkBlack2(syntheticHeader('IREO'))
    expect(check.ok).toBe(true)
  })

  it('refuses another game and names its game code', () => {
    const check = checkBlack2(syntheticHeader('IRBO'))
    expect(check).toEqual({
      ok: false,
      reason: expect.stringContaining('IRBO') as unknown,
    })
  })

  it('refuses another version of Black 2 and names the version', () => {
    const check = checkBlack2(syntheticHeader('IREO', 1))
    expect(check.ok).toBe(false)
    expect(check.ok ? '' : check.reason).toContain('version 1')
  })

  it('refuses a buffer too short for a header and names its length', () => {
    const check = checkBlack2(new Uint8Array(0x100))
    expect(check.ok).toBe(false)
    expect(check.ok ? '' : check.reason).toContain('256 bytes')
  })
})
