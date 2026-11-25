// The direct entry's routine (README.md): a proc of our own that the page writes into the game's
// memory and queues in place of the boot screens. Its init builds a trainer battle with the game's
// own functions, its main waits until the page has written the battle's names and parties, then
// starts the music and replaces itself by the battle's proc.
//
// The file holds no address, offset, size or constant of the game. Every one of them reaches the
// routine at run time through the order block, which the proc manager hands to each function as
// its param. The types below are ours, declared from the calls' signatures.

typedef unsigned int u32;
typedef unsigned short u16;
typedef int s32;
typedef int BOOL;
typedef u16 HeapID;

#define TRUE 1
#define FALSE 0
#define NULL ((void *)0)

// The routine's stages in the order block's word `stage`. The page writes STAGE_NONE with the
// block; a failed stage names the call that gave no pointer, and the routine then waits for good.
#define STAGE_NONE 0
#define STAGE_STARTED 1
#define STAGE_PARKED 2
#define STAGE_GONE 3
#define STAGE_NO_GAME_DATA 4
#define STAGE_NO_SETUP 5

// No trainer of the game's own list: the setup gets an empty opponent that the page fills.
#define NO_ROM_TRAINER 0

// The order block. Every member is one word, so the page and the compiler agree on each member's
// place with no padding. src/gen5/routine-order.ts lists the same members in the same order, and a
// spec holds the two lists equal.
typedef struct OrderBlock {
    // Set by the routine alone: one of the stages above
    volatile u32 stage;
    // Set by the page alone, to nonzero once its writes into the setup are done
    volatile u32 go;
    // Given back for the page's writes: what GameData_Create and BtlSetup_Create returned
    u32 gameData;
    u32 setup;
    // Call addresses, each with the Thumb bit set
    u32 gameDataCreate;
    u32 setupCreate;
    u32 resetFieldStatus;
    u32 setTrainer1v1Single;
    u32 bgmPlay;
    u32 replaceProc;
    // The heap for the game data, the setup and the trainer (HEAPID_USER)
    u32 heapId;
    // The battle's overlay (OVERLAY_BATTLE_MAIN) and its proc table (BATTLE_PROC_FUNCTIONS)
    u32 battleOverlayId;
    u32 battleProcFunctions;
    // The music call's channels (SND_CHANNEL_MASK_ALL)
    u32 channelMask;
    // The byte offset of fieldSituation.bgm, a halfword, inside BtlSetup
    u32 bgmOffset;
    // Room for one BtlFieldStatus, which the page reserves by the generated layout's size
    u32 fieldStatus;
} OrderBlock;

typedef void *(*CreateFunc)(HeapID heapId);
typedef void (*ResetFieldStatusFunc)(void *status);
typedef void (*SetTrainerFunc)(void *setup, void *gameData, void *status, u32 trainerId, HeapID heapId);
typedef void (*BgmPlayFunc)(u32 bgm, u32 channelMask);
typedef void (*ReplaceProcFunc)(s32 overlayId, const void *functions, void *param);

// Builds the game data and the setup of a one-on-one trainer battle, then parks
BOOL RoutineProc_Init(void *proc, u32 *state, void *param, void *work) {
    OrderBlock *order = param;
    HeapID heapId = (HeapID)order->heapId;
    void *status = (void *)order->fieldStatus;
    void *gameData;
    void *setup;

    (void)proc;
    (void)state;
    (void)work;
    order->stage = STAGE_STARTED;
    gameData = ((CreateFunc)order->gameDataCreate)(heapId);
    if (gameData == NULL) {
        order->stage = STAGE_NO_GAME_DATA;
        return TRUE;
    }
    order->gameData = (u32)gameData;
    setup = ((CreateFunc)order->setupCreate)(heapId);
    if (setup == NULL) {
        order->stage = STAGE_NO_SETUP;
        return TRUE;
    }
    order->setup = (u32)setup;
    ((ResetFieldStatusFunc)order->resetFieldStatus)(status);
    ((SetTrainerFunc)order->setTrainer1v1Single)(setup, gameData, status, NO_ROM_TRAINER, heapId);
    order->stage = STAGE_PARKED;
    return TRUE;
}

// Waits frame after frame for the page's go, then hands over to the battle as the Battle
// Competition does: the setup's music first, then the battle's proc in place of this one.
// A failed stage never reaches the go, so the routine waits for good.
BOOL RoutineProc_Main(void *proc, u32 *state, void *param, void *work) {
    OrderBlock *order = param;
    u32 bgm;

    (void)proc;
    (void)state;
    (void)work;
    if (order->stage != STAGE_PARKED || order->go == FALSE) {
        return FALSE;
    }
    bgm = *(volatile u16 *)(order->setup + order->bgmOffset);
    ((BgmPlayFunc)order->bgmPlay)(bgm, order->channelMask);
    ((ReplaceProcFunc)order->replaceProc)((s32)order->battleOverlayId, (const void *)order->battleProcFunctions,
                                          (void *)order->setup);
    order->stage = STAGE_GONE;
    return TRUE;
}

// Nothing to free: the game data and the setup live on for the battle
BOOL RoutineProc_Exit(void *proc, u32 *state, void *param, void *work) {
    (void)proc;
    (void)state;
    (void)param;
    (void)work;
    return TRUE;
}
