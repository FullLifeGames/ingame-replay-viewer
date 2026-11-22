#ifndef GUARD_IRV_WASM_GBA_SYSCALL_H
#define GUARD_IRV_WASM_GBA_SYSCALL_H

// The WebAssembly build (#35): CpuSet and CpuFastSet become plain calls of the platform's BIOS
// functions, without the alignment asserts. wasm32 aligns some structs to 2 where the GBA build's
// -mabi=apcs-gnu aligns them to 4 (struct ItemSlot in player_pc.c), and linear memory takes any
// alignment.
#include_next "gba/syscall.h"
#undef CpuSet
#undef CpuFastSet

#endif // GUARD_IRV_WASM_GBA_SYSCALL_H
