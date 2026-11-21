import { describe, expect, it } from 'vitest'

import { parseCharmap, parseDisplayNames, parseEnum, parseIncludes } from './gen3-parse.ts'

const MOVES = `#ifndef GUARD_CONSTANTS_MOVES_H
enum __attribute__((packed)) Move
{
    MOVE_NONE = 0,
    MOVE_POUND = 1, // a comment
    MOVE_DOUBLE_SLAP = 3,
    MOVE_DOUBLESLAP = MOVE_DOUBLE_SLAP, // Pre-Gen VI name
    MOVE_COMET_PUNCH,
    /* Expands to:
     *   MOVE_X = MOVE_Y,
     */
    MOVE_HEX = 0x10,
    LAST_MOVE = MOVE_HEX,
    MOVES_COUNT,
};
enum Other
{
    OTHER_A,
};
`

describe('parseEnum (T1)', () => {
  it('reads "= n", aliases, implicit +1, hex and skips comments', () => {
    expect([...parseEnum(MOVES, 'Move')]).toEqual([
      ['MOVE_NONE', 0],
      ['MOVE_POUND', 1],
      ['MOVE_DOUBLE_SLAP', 3],
      ['MOVE_DOUBLESLAP', 3],
      ['MOVE_COMET_PUNCH', 4],
      ['MOVE_HEX', 16],
      ['LAST_MOVE', 16],
      ['MOVES_COUNT', 17],
    ])
  })

  it('numbers an implicit first entry 0 and finds the enum by its name', () => {
    expect([...parseEnum(MOVES, 'Other')]).toEqual([['OTHER_A', 0]])
  })

  it('fails on a form it does not know', () => {
    const text = 'enum Move\n{\n    MOVE_A = MOVE_B + 1,\n};\n'
    expect(() => parseEnum(text, 'Move')).toThrow(/enum Move: cannot read "MOVE_A = MOVE_B \+ 1,"/)
  })

  it('fails on an alias of a name it has not seen', () => {
    const text = 'enum Move\n{\n    MOVE_A = MOVE_B,\n};\n'
    expect(() => parseEnum(text, 'Move')).toThrow(/enum Move: MOVE_A names unknown MOVE_B/)
  })

  it('fails on a missing enum', () => {
    expect(() => parseEnum(MOVES, 'Species')).toThrow(/no enum Species/)
  })

  it('skips the metaprogram lines and refuses to count on after them', () => {
    const text = [
      'enum Item',
      '{',
      '    ITEM_TM01 = 582,',
      '    #define ENUM_TM(n, id) CAT(ITEM_TM_, id) = CAT(ITEM_TM, n),',
      '    RECURSIVELY(R_ZIP(ENUM_TM, TO_TMHM_NUMS NUMBERS_256, (FOREACH_TM(APPEND_COMMA))))',
      '    #undef ENUM_TM',
      '    ITEM_OVAL_CHARM = 690,',
      '    ITEM_SHINY_CHARM,',
      '};',
    ].join('\n')
    expect(Object.fromEntries(parseEnum(text, 'Item'))).toEqual({
      ITEM_TM01: 582,
      ITEM_OVAL_CHARM: 690,
      ITEM_SHINY_CHARM: 691,
    })
    const counted = text.replace('    ITEM_OVAL_CHARM = 690,\n', '')
    expect(() => parseEnum(counted, 'Item')).toThrow(/ITEM_SHINY_CHARM follows a metaprogram line/)
  })
})

const SPECIES_INFO = `#define UNOWN_MISC_INFO(letter)                    \\
    {                                                \\
        .speciesName = _("Unown"),                   \\
        .baseHP = 48,                                \\
    }
#define MOTHIM_SPECIES_INFO                          \\
    {                                                \\
        .speciesName = _("Mothim"),                  \\
    }
#define NESTED_INFO(x)                               \\
    {                                                \\
        UNOWN_MISC_INFO(x),                          \\
    }

#if P_FAMILY_NIDORAN
    [SPECIES_NIDORAN_F] =
    {
        .baseHP = 55,
        .description = COMPOUND_STRING("Uses \\"quotes\\" // not a comment"),
        .speciesName = _("Nidoran♀"),
        .evolutions = EVOLUTION({EVO_LEVEL, 16, SPECIES_NIDORINA}),
    },
#endif
    [SPECIES_UNOWN_B] = UNOWN_MISC_INFO(B),
    [SPECIES_MOTHIM_SANDY] = MOTHIM_SPECIES_INFO,
    [SPECIES_NESTED] = NESTED_INFO(1),
    [SPECIES_NAMELESS] = { .baseHP = 1 },
`

describe('parseDisplayNames (T2)', () => {
  it('reads the name inside an entry, through a macro and a nested macro', () => {
    expect(Object.fromEntries(parseDisplayNames(SPECIES_INFO, 'SPECIES', 'speciesName'))).toEqual({
      SPECIES_NIDORAN_F: 'Nidoran♀',
      SPECIES_UNOWN_B: 'Unown',
      SPECIES_MOTHIM_SANDY: 'Mothim',
      SPECIES_NESTED: 'Unown',
    })
  })

  it('reads COMPOUND_STRING and ITEM_NAME names', () => {
    const text = [
      '[MOVE_POUND] = { .name = COMPOUND_STRING("Pound"), .power = 40 },',
      '[ITEM_POKE_BALL] = { .name = ITEM_NAME("Poké Ball") },',
    ].join('\n')
    expect(Object.fromEntries(parseDisplayNames(text, 'MOVE', 'name'))).toEqual({
      MOVE_POUND: 'Pound',
    })
    expect(Object.fromEntries(parseDisplayNames(text, 'ITEM', 'name'))).toEqual({
      ITEM_POKE_BALL: 'Poké Ball',
    })
  })

  it('fails on one key with two names', () => {
    const text = '[MOVE_A] = { .name = _("A") },\n[MOVE_A] = { .name = _("B") },\n'
    expect(() => parseDisplayNames(text, 'MOVE', 'name')).toThrow(/MOVE_A is "A" and "B"/)
  })

  it('lists the included files', () => {
    const text = '#include "constants/abilities.h"\n    #include "species_info/gen_1_families.h"\n'
    expect(parseIncludes(text, 'species_info/')).toEqual(['species_info/gen_1_families.h'])
  })
})

const CHARMAP = `' '         = 00
'A'         = BB
'\\''         = B4
'’'         = B4
'♀'         = B6
NBSP        = 39
PKMN        = 53 54
'_'         = AE @ For autogenerating strings
'$'         = FF

@ Hiragana
'お' = 05
'\\n' = FE @ new line
`

describe('parseCharmap (T3)', () => {
  it('reads the Latin section: characters, named sequences and the end of a string', () => {
    const charmap = parseCharmap(CHARMAP)
    expect(charmap.eos).toBe(0xff)
    expect(charmap.chars).toEqual({ ' ': 0, A: 0xbb, "'": 0xb4, '’': 0xb4, '♀': 0xb6, _: 0xae })
    expect(charmap.named).toEqual({ NBSP: [0x39], PKMN: [0x53, 0x54] })
  })

  it('leaves out the kana that reuse the same bytes', () => {
    expect(parseCharmap(CHARMAP).chars).not.toHaveProperty('お')
  })

  it('fails on a line it cannot read, a character with two bytes and a missing section end', () => {
    expect(() => parseCharmap(`'A' = BB 01\n@ Hiragana\n`)).toThrow(/charmap line 1: cannot read/)
    expect(() => parseCharmap(`'A' = BB\n'A' = BC\n'$' = FF\n@ Hiragana\n`)).toThrow(
      /charmap line 2: 'A' is 0xBB and 0xBC/,
    )
    expect(() => parseCharmap(`'A' = BB\n'$' = FF\n`)).toThrow(/no "@ Hiragana" line/)
    expect(() => parseCharmap(`'A' = BB\n@ Hiragana\n`)).toThrow(/no '\$'/)
  })
})
