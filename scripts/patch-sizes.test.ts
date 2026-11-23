import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  census,
  censusTable,
  classify,
  fileSizes,
  parseNm,
  parseSizesArgs,
  sizeTable,
} from './patch-sizes.ts'

/** One line of `nm -P -t x`: name, type, value and size in hex. */
function line(name: string, type: string, size: number): string {
  return `${name} ${type} 08000000 ${size.toString(16)}`
}

describe('fileSizes', () => {
  it('gives the raw size and the sizes with gzip 9 and brotli 11', () => {
    const data = Buffer.from('a patch with a patch with a patch inside '.repeat(64))
    const brotli = brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length
    expect(fileSizes('x.bps', data)).toEqual({
      name: 'x.bps',
      raw: data.length,
      gzip: gzipSync(data, { level: 9 }).length,
      brotli,
    })
  })
})

describe('parseNm', () => {
  it('reads the size and type of each symbol and skips symbols without a size', () => {
    const text = [line('Cry_Bulbasaur', 'r', 0x200), 'Intr_Main t 08000248', ''].join('\n')
    expect(parseNm(text)).toEqual([{ name: 'Cry_Bulbasaur', type: 'r', size: 0x200 }])
  })

  it('fails on a line that is no nm symbol', () => {
    expect(() => parseNm('not a symbol line at all here')).toThrow(/nm line/)
  })
})

describe('classify', () => {
  it('counts the cries and the pics of species up to 386 as retail', () => {
    expect(classify({ name: 'Cry_Bulbasaur', type: 'r', size: 1 })).toEqual({
      symbolClass: 'cries',
      retail: true,
    })
    for (const name of ['gMonFrontPic_CastformSunny', 'gMonIcon_UnownB', 'gMonBackPic_MrMime']) {
      expect(classify({ name, type: 'R', size: 1 })).toEqual({
        symbolClass: 'pokemonGraphics',
        retail: true,
      })
    }
  })

  it('keeps later species, new forms and overworld pics out of the retail share', () => {
    const cases = [
      ['Cry_Sprigatito', 'cries'],
      ['gMonFrontPic_VenusaurMega', 'pokemonGraphics'],
      ['gMonFrontPic_VileplumeF', 'pokemonGraphics'],
      ['gObjectEventPic_Aron', 'pokemonGraphics'],
      ['gObjectEventPic_KommoO', 'pokemonGraphics'],
      ['gOverworldPalette_Aron', 'pokemonGraphics'],
    ] as const
    for (const [name, symbolClass] of cases) {
      expect(classify({ name, type: 'R', size: 1 })).toEqual({ symbolClass, retail: false })
    }
  })

  it('sorts code, sound, animation and trainer graphics, and the rest', () => {
    const cases = [
      [{ name: 'Task_Anything', type: 't' }, 'code'],
      [{ name: 'gObjectEventPic_Steven', type: 'R' }, 'other'],
      [{ name: 'DirectSoundWaveData_Sc88ProPiano', type: 'R' }, 'otherSound'],
      [{ name: 'mus_littleroot', type: 'R' }, 'otherSound'],
      [{ name: 'gBattleAnimSpriteGfx_Bone', type: 'R' }, 'battleAnimGraphics'],
      [{ name: 'gBattleAnimMove_Pound', type: 'R' }, 'other'],
      [{ name: 'gTrainerFrontPic_Hiker', type: 'R' }, 'trainerGraphics'],
      [{ name: 'gSpeciesInfo', type: 'R' }, 'other'],
    ] as const
    for (const [symbol, symbolClass] of cases) {
      expect(classify({ ...symbol, size: 1 }).symbolClass).toBe(symbolClass)
    }
  })
})

describe('census', () => {
  it('sums the bytes and the retail bytes per class and leaves bss out', () => {
    const symbols = parseNm(
      [
        line('Cry_Bulbasaur', 'r', 100),
        line('Cry_Sprigatito', 'r', 50),
        line('Main', 'T', 30),
        line('gHeap', 'B', 1000),
        line('gReplayState', 'b', 10),
      ].join('\n'),
    )
    const totals = census(symbols)
    expect(totals.find((total) => total.symbolClass === 'cries')).toEqual({
      symbolClass: 'cries',
      symbols: 2,
      bytes: 150,
      retailBytes: 100,
    })
    expect(totals.find((total) => total.symbolClass === 'code')?.bytes).toBe(30)
    expect(totals.reduce((sum, total) => sum + total.bytes, 0)).toBe(180)
  })
})

describe('tables', () => {
  it('writes the sizes as a Markdown table', () => {
    const table = sizeTable([{ name: 'a.bps', raw: 1234567, gzip: 1000, brotli: 900 }])
    expect(table.split('\n')).toEqual([
      '| File | Raw | gzip 9 | brotli 11 |',
      '| --- | ---: | ---: | ---: |',
      '| a.bps | 1,234,567 | 1,000 | 900 |',
    ])
  })

  it('writes the census with a total line', () => {
    const totals = census(
      parseNm([line('Cry_Bulbasaur', 'r', 100), line('Main', 'T', 30)].join('\n')),
    )
    const rows = censusTable(totals).split('\n')
    expect(rows[0]).toBe('| Class | Symbols | Bytes | Species up to 386 |')
    expect(rows).toContain('| cries | 1 | 100 | 100 |')
    expect(rows).toContain('| code | 1 | 30 | 0 |')
    expect(rows.at(-1)).toBe('| **total** | 2 | 130 | 100 |')
  })
})

describe('parseSizesArgs', () => {
  it('takes the files to measure and an optional ELF', () => {
    expect(parseSizesArgs(['a.bps', '--elf', 'r.elf', 'b.bps'])).toEqual({
      files: ['a.bps', 'b.bps'],
      elf: 'r.elf',
    })
    expect(parseSizesArgs(['a.bps'])).toEqual({ files: ['a.bps'], elf: undefined })
  })

  it('fails without a file or with an ELF flag that names none', () => {
    expect(() => parseSizesArgs([])).toThrow(/usage/)
    expect(() => parseSizesArgs(['a.bps', '--elf'])).toThrow(/usage/)
  })
})
