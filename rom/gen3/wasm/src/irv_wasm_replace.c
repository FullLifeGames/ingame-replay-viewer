#include "global.h"
#include "main.h"
#include "random.h"
#include "replay_interpreter.h"
#include "replay_slot.h"

// The WebAssembly build (#35): what the GBA build takes from assembly or from its linker script,
// and the two addresses the host needs.

// random.c's Random32 is Thumb assembly, renamed away by wasm.json. It steps gRngValue on stream
// 1, which is what _SFC32_Next does: its counter steps by one.
u32 Random32(void)
{
    return _SFC32_Next(&gRngValue);
}

// ld_script_modern.ld sets gInitialMainCB2 = CB2_ReplayBoot (patch 0003), and main.c takes its
// address as the first callback. Here it is a function that hands the callback over at once, so
// gMain.callback2 holds CB2_ReplayBoot from the first frame on, as in the ROM.
void gInitialMainCB2(void)
{
    SetMainCallback2(CB2_ReplayBoot);
    CB2_ReplayBoot();
}

// Linker-script symbols that only a crash screen (assertf.c) and the debug menu (debug.c) read.
// The stack does not lie in IWRAM here, so __iwram_end marks no real end.
char __iwram_end[1];
u8 __rom_end[1];

// The host writes the stream into the slot before it calls AgbMain, and reads the progress while
// the replay plays. Both are plain data in linear memory; their addresses come from here, not from
// a link map.
const struct ReplaySlot *IrvWasm_Slot(void)
{
    return &gReplaySlot;
}

const struct ReplayProgress *IrvWasm_Progress(void)
{
    return &gReplayProgress;
}
