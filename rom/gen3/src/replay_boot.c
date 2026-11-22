#include "global.h"
#include "gpu_regs.h"
#include "load_save.h"
#include "m4a.h"
#include "main.h"
#include "malloc.h"
#include "new_game.h"
#include "replay_interpreter.h"
#include "replay_slot.h"
#include "save.h"
#include "sound.h"
#include "constants/characters.h"
#include "constants/rgb.h"
#include "constants/songs.h"

// The ROM's first callback: patch 0003 makes it gInitialMainCB2, so the replay in the slot starts
// at once, with no title screen, no save file and no button press (ADR 0003). The ROM never loads
// a save and never writes flash.

static void CB2_ReplayRefused(void);
static void CB2_ReplayLeft(void);
static void CB2_ReplayStopped(void);

// The save-free half of CB2_InitCopyrightScreenAfterBootup (intro.c). The save blocks start
// cleared, with the default options, as the test runner has them, instead of coming from flash.
static void InitWithoutSave(void)
{
    SetSaveBlocksPointers(0);
    ResetMenuAndMonGlobals();
    Save_ResetSaveCounters();
    ClearSav1();
    Sav2_ClearSetDefault();
    ClearSav3();
    gSaveBlock2Ptr->playerName[0] = EOS;
    SetPokemonCryStereo(gSaveBlock2Ptr->optionsSound);
    InitHeap(gHeap, HEAP_SIZE);
}

// The slot of the built ROM has its magic, its version and a stream length of 0; the page writes
// only the length and the stream. Anything else is not a slot the interpreter can read.
static bool32 IsReplaySlot(const volatile struct ReplaySlot *slot)
{
    u32 i;

    for (i = 0; i < REPLAY_SLOT_MAGIC_LENGTH; i++)
    {
        if (slot->header.magic[i] != REPLAY_SLOT_MAGIC[i])
            return FALSE;
    }
    return slot->header.slotVersion == REPLAY_SLOT_VERSION
        && slot->header.streamLength <= sizeof(slot->stream);
}

void CB2_ReplayBoot(void)
{
    // The page fills the slot after the build, so it is read through a volatile pointer.
    const volatile struct ReplaySlot *slot = &gReplaySlot;
    enum ReplayError error;

    InitWithoutSave();
    if (!IsReplaySlot(slot))
    {
        memset(&gReplayProgress, 0, sizeof(gReplayProgress));
        gReplayProgress.error = REPLAY_ERROR_HEADER;
        SetMainCallback2(CB2_ReplayRefused);
        return;
    }
    error = Replay_Start(slot->stream, slot->header.streamLength, REPLAY_OUTRO_THEN_HOLD, CB2_ReplayLeft);
    if (error != REPLAY_ERROR_NONE)
    {
        SetMainCallback2(CB2_ReplayRefused);
        return;
    }
    PlayBGM(MUS_VS_TRAINER);
}

// A refused stream (plan D8): every layer off, so the screen shows the backdrop colour alone.
// gReplayProgress.error says why; the page checks a stream with the same rules before it boots.
static void CB2_ReplayRefused(void)
{
    SetVBlankCallback(NULL);
    SetGpuReg(REG_OFFSET_DISPCNT, 0);
    *(vu16 *)PLTT = RGB(REPLAY_REFUSED_RED, 0, 0);
    DebugPrintf("replay refused: error %d", gReplayProgress.error);
    SetMainCallback2(CB2_ReplayStopped);
}

// After a B press has left the playback (BattleMainCB2): the screen stays black from the fade.
static void CB2_ReplayLeft(void)
{
    SetVBlankCallback(NULL);
    SetMainCallback2(CB2_ReplayStopped);
}

// Nothing runs; the screen keeps what it shows until the emulator is reset.
static void CB2_ReplayStopped(void)
{
}
