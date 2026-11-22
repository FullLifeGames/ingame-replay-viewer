#ifndef GUARD_IRV_WASM_GBA_SYSCALL_H
#define GUARD_IRV_WASM_GBA_SYSCALL_H

// The WebAssembly build (#35): CpuSet and CpuFastSet become plain calls of our platform layer's
// BIOS functions (rom/gen3/wasm/layer/irv_bios.c, #43), without the alignment asserts. wasm32 aligns some structs to 2 where the GBA build's
// -mabi=apcs-gnu aligns them to 4 (struct ItemSlot in player_pc.c), and linear memory takes any
// alignment.
#include_next "gba/syscall.h"
#undef CpuSet
#undef CpuFastSet

#endif // GUARD_IRV_WASM_GBA_SYSCALL_H
