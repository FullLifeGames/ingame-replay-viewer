#ifndef GUARD_IRV_WASM_GBA_M4A_INTERNAL_H
#define GUARD_IRV_WASM_GBA_M4A_INTERNAL_H

// The WebAssembly build (#35): the GBA build's linker script sets gNumMusicPlayers and gMaxLines
// (ld_script_modern.ld), and C reads their addresses as numbers. wasm-ld has no linker script, so
// the two values come from here, as the script sets them.
#include_next "gba/m4a_internal.h"
#undef NUM_MUSIC_PLAYERS
#define NUM_MUSIC_PLAYERS 4
#undef MAX_LINES
#define MAX_LINES 0

#endif // GUARD_IRV_WASM_GBA_M4A_INTERNAL_H
