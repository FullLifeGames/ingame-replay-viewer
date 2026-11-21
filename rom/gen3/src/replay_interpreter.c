#include "global.h"
#include "battle.h"
#include "battle_main.h"
#include "palette.h"
#include "replay_interpreter.h"
#include "replay_stream.h"
#include "constants/rgb.h"

// The ROM interpreter (#6). Replay_Load checks the whole stream first (replay_stream.c), so a
// refusal never starts a battle and the step functions below can read their operands without
// checks.
//
// Replay_RunBattle stands in for the battle engine's gBattleMainFunc: once a frame, while no
// controller is busy and no wait runs, it runs one step of the current op. An op that needs two
// controller commands for one battler emits one, returns FALSE, and emits the other on its next
// step. When an op returns TRUE, the next op starts on the next frame.

typedef bool32 (*ReplayOpFunc)(const volatile u8 *operands, u32 step);

struct ReplayState
{
    const volatile u8 *instructions;
    u32 length;
    u32 at;
    void (*upstreamIntro)(void);
    u16 wait;
    u8 step;
    u8 end; // enum ReplayEnd
    bool8 loaded;
};

static bool32 Op_End(const volatile u8 *operands, u32 step);
static bool32 Op_Turn(const volatile u8 *operands, u32 step);
static void Replay_RunBattle(void);
static void Replay_Hold(void);

EWRAM_DATA struct ReplayProgress gReplayProgress = {0};
static EWRAM_DATA struct ReplayState sReplay = {0};

// The step function of each op. An op without one is one this interpreter does not play yet, and
// Replay_Validate refuses it.
static const ReplayOpFunc sOps[] =
{
    [REPLAY_OP_END]  = Op_End,
    [REPLAY_OP_TURN] = Op_Turn,
};

// The battle outcome of each REPLAY_OUTCOME_*. A tie and an unknown end are draws.
static const u8 sOutcomes[] =
{
    [REPLAY_OUTCOME_NEAR_WON] = B_OUTCOME_WON,
    [REPLAY_OUTCOME_FAR_WON]  = B_OUTCOME_LOST,
    [REPLAY_OUTCOME_TIE]      = B_OUTCOME_DREW,
    [REPLAY_OUTCOME_UNKNOWN]  = B_OUTCOME_DREW,
};

bool32 Replay_PlaysOp(u32 op)
{
    return op < ARRAY_COUNT(sOps) && sOps[op] != NULL;
}

enum ReplayError Replay_Load(const volatile u8 *stream, u32 length, enum ReplayEnd end)
{
    u16 count;
    enum ReplayError error = Replay_ValidateStream(stream, length, &count);

    memset(&gReplayProgress, 0, sizeof(gReplayProgress));
    memset(&sReplay, 0, sizeof(sReplay));
    gReplayProgress.error = error;
    if (error != REPLAY_ERROR_NONE)
        return error;
    gReplayProgress.total = count;
    sReplay.instructions = stream + Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET);
    sReplay.length = Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH);
    sReplay.end = end;
    sReplay.loaded = TRUE;
    return REPLAY_ERROR_NONE;
}

bool32 Replay_IsLoaded(void)
{
    return sReplay.loaded;
}

void Replay_Unload(void)
{
    memset(&sReplay, 0, sizeof(sReplay));
}

// gBattleMainFunc is DoBattleIntro here; the INTRO op runs it through sReplay.upstreamIntro.
void Replay_TakeOverBattleMain(void)
{
    if (!sReplay.loaded)
        return;
    sReplay.upstreamIntro = gBattleMainFunc;
    gBattleMainFunc = Replay_RunBattle;
}

static void Replay_RunBattle(void)
{
    const volatile u8 *instruction;

    if (gBattleControllerExecFlags)
        return;
    if (sReplay.wait != 0)
    {
        sReplay.wait--;
        return;
    }
    instruction = sReplay.instructions + sReplay.at;
    if (!sOps[instruction[0]](instruction + REPLAY_INSTRUCTION_HEADER_SIZE, sReplay.step))
    {
        sReplay.step++;
        return;
    }
    gReplayProgress.done++;
    sReplay.step = 0;
    sReplay.at += REPLAY_INSTRUCTION_HEADER_SIZE + instruction[1];
}

// After END: the battle stays on screen and nothing runs in its main loop.
static void Replay_Hold(void)
{
}

// END: gBattleOutcome, then hold the scene or leave the battle as a B press does in a recorded
// battle (BattleMainCB2). gMain.savedCallback runs after CB2_QuitRecordedBattle.
static bool32 Op_End(const volatile u8 *operands, u32 step)
{
    gBattleOutcome = sOutcomes[operands[0]];
    gReplayProgress.finished = TRUE;
    gBattleMainFunc = Replay_Hold;
    if (sReplay.end == REPLAY_EXIT_AT_END)
    {
        ResetPaletteFadeControl();
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        SetMainCallback2(CB2_QuitRecordedBattle);
    }
    return TRUE;
}

// TURN: the number of the turn that starts.
static bool32 Op_Turn(const volatile u8 *operands, u32 step)
{
    gReplayProgress.turn = Replay_ReadU16(operands);
    return TRUE;
}
