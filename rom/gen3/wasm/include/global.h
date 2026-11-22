#ifndef GUARD_IRV_WASM_GLOBAL_H
#define GUARD_IRV_WASM_GLOBAL_H

// The WebAssembly build (#35) reaches the expansion's global.h through this shadow, which comes
// first on -iquote. It changes one file of the tree and the platform files, each through a
// define of its own in wasm.json.
#include_next "global.h"

// The platform files: the port's own global.h brings <stdio.h> and DBGPRINTF, which prints
// nothing in its builds without DEBUG.
#ifdef IRV_WASM_PLATFORM
#include <stdio.h>
#define DBGPRINTF(...)
#endif

// The platform's sound files: the port's gba/types.h adds the fast integer types.
#ifdef IRV_WASM_PLATFORM
#include <stdint.h>
typedef int_fast8_t sf8;
typedef uint_fast8_t uf8;
typedef int_fast16_t sf16;
typedef uint_fast16_t uf16;
typedef int_fast32_t sf32;
typedef uint_fast32_t uf32;
#endif

// src/recorded_battle.c: wasm32 aligns a u64 to 8, so struct RecordedBattleSave outgrows its save
// sector. The viewer never writes a save, so the file's size asserts go.
#ifdef IRV_WASM_NO_SAVE_SIZE_ASSERTS
#undef STATIC_ASSERT
#define STATIC_ASSERT(expr, id) typedef char id[1];
#endif

#endif // GUARD_IRV_WASM_GLOBAL_H
