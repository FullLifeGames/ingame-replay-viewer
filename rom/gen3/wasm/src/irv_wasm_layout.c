// stdlib.h before global.h, whose abs macro would break the prototype of abs.
#include <stdlib.h>
#include "global.h"
#include <stdio.h>

// The WebAssembly build (#35) maps GBA addresses one to one into linear memory (plan D2): EWRAM,
// IWRAM, the IO registers, the palette, VRAM and OAM lie at their own addresses, and nothing of
// the module may lie there. Before AgbMain runs, this checks the regions wasm-ld and Emscripten
// laid out and refuses to start if one of them overlaps or the static data passes ROM_END, then
// sets the IO registers the game reads before it writes them to the values a GBA has after its
// BIOS.

#define GBA_RAM_START 0x02000000 // EWRAM
#define GBA_RAM_END   0x08000000 // the cartridge, where the module's static data starts

// Defined by wasm-ld.
extern char __global_base;
extern char __data_end;
extern char __stack_low;
extern char __stack_high;
extern char __heap_base;

#define WASM_PAGE_SIZE 0x10000

static bool32 OverlapsGbaRam(const char *name, uintptr_t start, uintptr_t end)
{
    if (start >= GBA_RAM_END || end <= GBA_RAM_START)
        return FALSE;
    printf("irv-emerald: the %s at 0x%08lx-0x%08lx overlaps GBA memory 0x%08x-0x%08x\n",
           name, (unsigned long)start, (unsigned long)end, GBA_RAM_START, GBA_RAM_END);
    return TRUE;
}

// field_name_box.c takes an address between ROM_START and ROM_END for a cartridge address, and
// malloc.c rebuilds one from ROM_START and an offset. The module's static data stands in for the
// cartridge, so it must end at ROM_END or below.
static bool32 PassesRomEnd(uintptr_t end)
{
    if (end <= ROM_END)
        return FALSE;
    printf("irv-emerald: the static data ends at 0x%08lx, past the cartridge's end 0x%08x\n",
           (unsigned long)end, ROM_END);
    return TRUE;
}

static void CheckLayout(void)
{
    uintptr_t memoryEnd = __builtin_wasm_memory_size(0) * WASM_PAGE_SIZE;
    bool32 overlaps = FALSE;

    overlaps |= OverlapsGbaRam("static data", (uintptr_t)&__global_base, (uintptr_t)&__data_end);
    overlaps |= PassesRomEnd((uintptr_t)&__data_end);
    overlaps |= OverlapsGbaRam("stack", (uintptr_t)&__stack_low, (uintptr_t)&__stack_high);
    overlaps |= OverlapsGbaRam("heap", (uintptr_t)&__heap_base, memoryEnd);
    if (overlaps || memoryEnd < GBA_RAM_END)
    {
        printf("irv-emerald: the memory layout leaves no room for the GBA; refusing to start\n");
        abort();
    }
}

// The BIOS leaves the display in forced blank, so the game's first SetGpuReg calls write at once
// (gpu_regs.c), and KEYINPUT reads all keys up: its bits are low while a key is held.
static void ResetIoRegisters(void)
{
    REG_DISPCNT = DISPCNT_FORCED_BLANK;
    REG_KEYINPUT = KEYS_MASK;
}

__attribute__((constructor)) static void IrvWasm_Start(void)
{
    CheckLayout();
    ResetIoRegisters();
}
