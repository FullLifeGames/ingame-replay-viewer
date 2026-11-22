// The functions that request effects, for the WebAssembly build (#35, plan §8). The expansion marks
// a script command or a native that calls Script_RequestEffects by writing `func + ROM_SIZE`
// (asm/macros/event.inc, data/script_cmd_table.inc), so the pointer lies in ROM mirror 1, and
// script.c tests that bit. A wasm table index carries no addend. The converter writes the plain
// index instead and lists each marked function once in gIrvWasmEffectFunctions, which the overlay
// patch of Script_IsEffectInstrumentedCommand searches.

// ROM_SIZE in the expansion's constants/gba_constants.inc: 32 MB.
export const EFFECT_ADDEND = 0x02000000

const EFFECT_LIST = 'gIrvWasmEffectFunctions'
const EFFECT_COUNT = 'gIrvWasmEffectFunctionCount'

// The list in name order, so the output does not depend on the order of the relocations. The
// table indices that wasm-ld gives the functions are not known here, so the C side scans the list.
export function effectList(names: readonly string[]): string[] {
  if (names.length === 0) return []
  const sorted = [...new Set(names)].sort()
  return [
    `\t.section\t.rodata.irv_wasm_effects,"",@`,
    '\t.p2align\t2',
    `\t.globl\t${EFFECT_LIST}`,
    `${EFFECT_LIST}:`,
    ...sorted.map((name) => `\t.int32\t${name}`),
    `\t.size\t${EFFECT_LIST}, ${String(sorted.length * 4)}`,
    `\t.globl\t${EFFECT_COUNT}`,
    `${EFFECT_COUNT}:`,
    `\t.int32\t${String(sorted.length)}`,
    `\t.size\t${EFFECT_COUNT}, 4`,
  ]
}
