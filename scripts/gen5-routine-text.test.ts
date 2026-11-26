import { describe, expect, it } from 'vitest'

import {
  cDefines,
  checkOrderMembers,
  cStructMembers,
  literalsAbove,
  procOffsets,
  refuseDiffering,
  refuseRelocations,
  refuseUndefined,
} from './gen5-routine-text'

// Every input here is written for the spec: invented tool output and an invented C file.
const NM = [
  '00000030 T RoutineProc_Exit',
  '00000000 T RoutineProc_Init',
  '0000001a T RoutineProc_Main',
  '00000000 t helperSpin',
  '',
].join('\n')

// Scene: the page puts each proc function's address, with the Thumb bit, into the proc table.
describe('procOffsets', () => {
  it("reads the three functions' offsets from the compiler's symbols", () => {
    expect(procOffsets(NM)).toEqual({ init: 0, main: 0x1a, exit: 0x30 })
  })

  it('throws on a missing function and on one that is no code', () => {
    expect(() => procOffsets(NM.replace(/^.*RoutineProc_Main\n/m, ''))).toThrow(/RoutineProc_Main/)
    expect(() => procOffsets(NM.replace('T RoutineProc_Exit', 'D RoutineProc_Exit'))).toThrow(
      /RoutineProc_Exit/,
    )
  })
})

// Scene: a relocation means an address the compiler left for a linker, which the page never runs.
describe('refuseRelocations', () => {
  it('passes the sentence of no relocation', () => {
    expect(() => {
      refuseRelocations('\nThere are no relocations in this file.\n')
    }).not.toThrow()
  })

  it('throws on any relocation section, and on output it cannot read', () => {
    const one = [
      '',
      "Relocation section '.rel.text' at offset 0x1f0 contains 1 entry:",
      ' Offset     Info    Type            Sym.Value  Sym. Name',
      '00000024  00000b0a R_ARM_THM_CALL    00000000   spinWheel',
      '',
    ].join('\n')
    expect(() => {
      refuseRelocations(one)
    }).toThrow(/relocation.*spinWheel/)
    expect(() => {
      refuseRelocations('')
    }).toThrow(/relocation/)
  })
})

// Scene: an undefined symbol is a call the routine cannot make, the compiler's library included.
describe('refuseUndefined', () => {
  it('passes an empty list', () => {
    expect(() => {
      refuseUndefined('\n')
    }).not.toThrow()
  })

  it("throws on an undefined symbol, and names a call into the compiler's library", () => {
    expect(() => {
      refuseUndefined('         U spinWheel\n')
    }).toThrow(/undefined.*spinWheel/)
    expect(() => {
      refuseUndefined('         U __aeabi_uidiv\n')
    }).toThrow(/compiler's library.*__aeabi_uidiv/)
  })
})

const C_FILE = [
  '#define STAGE_IDLE 0',
  '#define STAGE_SPINNING 3 // spins',
  '#define OTHER_THING 2',
  '// A block, 0x7f words long in no game',
  'typedef struct Wheel {',
  '    // the first',
  '    volatile u32 spin;',
  '',
  '    u32 brake;',
  '} Wheel;',
].join('\n')

describe('cStructMembers', () => {
  it("lists the struct's members in order, comments and blank lines aside", () => {
    expect(cStructMembers(C_FILE, 'Wheel')).toEqual(['spin', 'brake'])
  })

  it('throws on a member that is no word, on a line it cannot read and on no struct', () => {
    expect(() => cStructMembers(C_FILE.replace('u32 brake', 'u16 brake'), 'Wheel')).toThrow(/brake/)
    expect(() => cStructMembers(C_FILE.replace('u32 brake;', 'u32 brake[2];'), 'Wheel')).toThrow(
      /brake/,
    )
    expect(() => cStructMembers(C_FILE, 'Axle')).toThrow(/Axle/)
  })
})

// Scene: a member added on one side alone, or two swapped, fails before any build.
describe('checkOrderMembers', () => {
  it('passes equal lists', () => {
    expect(() => {
      checkOrderMembers(['spin', 'brake'], ['spin', 'brake'])
    }).not.toThrow()
  })

  it('throws on a member on one side alone, naming its side, and on a changed order', () => {
    expect(() => {
      checkOrderMembers(['spin', 'brake', 'horn'], ['spin', 'brake'])
    }).toThrow(/horn.*C/)
    expect(() => {
      checkOrderMembers(['spin'], ['spin', 'bell'])
    }).toThrow(/bell.*TypeScript/)
    expect(() => {
      checkOrderMembers(['brake', 'spin'], ['spin', 'brake'])
    }).toThrow(/order/)
  })
})

describe('cDefines', () => {
  it("reads the prefix's defines by name, comments aside", () => {
    expect(cDefines(C_FILE, 'STAGE_')).toEqual({ IDLE: 0, SPINNING: 3 })
  })
})

// Scene: a game's address pasted into the routine fails CI before it reaches a commit.
describe('literalsAbove', () => {
  it('finds decimal and hex literals at or above the bound, comments included', () => {
    expect(literalsAbove(C_FILE, 16)).toEqual(['0x7f'])
    expect(literalsAbove('x = 15; y = 16; z = 0x10;', 16)).toEqual(['16', '0x10'])
  })

  it('reads no literal inside a name', () => {
    expect(literalsAbove('u32 v; u16 w; spin64x;', 16)).toEqual([])
  })
})

// Scene: a build that changes from run to run cannot be checked against its hash.
describe('refuseDiffering', () => {
  it('passes equal bytes and throws on a changed byte or length', () => {
    expect(() => {
      refuseDiffering(Uint8Array.of(1, 2), Uint8Array.of(1, 2))
    }).not.toThrow()
    expect(() => {
      refuseDiffering(Uint8Array.of(1, 2), Uint8Array.of(1, 3))
    }).toThrow(/runs differ/)
    expect(() => {
      refuseDiffering(Uint8Array.of(1, 2), Uint8Array.of(1))
    }).toThrow(/runs differ/)
  })
})
