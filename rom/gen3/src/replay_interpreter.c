#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "battle_main.h"
#include "battle_message.h"
#include "battle_util.h"
#include "line_break.h"
#include "palette.h"
#include "pokemon.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "test_runner.h"
#include "text.h"
#include "constants/battle.h"
#include "constants/characters.h"
#include "constants/rgb.h"

// The ROM interpreter (#6). Replay_Load checks the whole stream first (replay_stream.c), so a
// refusal never starts a battle and the step functions below can read their operands without
// checks.
//
// Replay_RunBattle stands in for the battle engine's gBattleMainFunc: once a frame, while no
// controller is busy, no text prints and no wait runs, it runs one step of the current op. An op that needs two
// controller commands for one battler emits one, returns FALSE, and emits the other on its next
// step. When an op returns TRUE, the next op starts on the next frame.

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
static bool32 Op_Print(const volatile u8 *operands, u32 step);
static bool32 Op_Intro(const volatile u8 *operands, u32 step);
static bool32 Op_SendOut(const volatile u8 *operands, u32 step);
static void Replay_RunBattle(void);
static void Replay_Hold(void);
static void Replay_Exit(void);

EWRAM_DATA struct ReplayProgress gReplayProgress = {0};
static EWRAM_DATA struct ReplayState sReplay = {0};

// The step function of each op. An op without one is one this interpreter does not play yet, and
// Replay_Validate refuses it.
static const ReplayOpFunc sOps[] =
{
    [REPLAY_OP_END]      = Op_End,
    [REPLAY_OP_TURN]     = Op_Turn,
    [REPLAY_OP_PRINT]    = Op_Print,
    [REPLAY_OP_INTRO]    = Op_Intro,
    [REPLAY_OP_SEND_OUT] = Op_SendOut,
    [REPLAY_OP_MOVE]     = Replay_OpMove,
    [REPLAY_OP_HIT]      = Replay_OpHit,
    [REPLAY_OP_HP]       = Replay_OpHp,
    [REPLAY_OP_FAINT]    = Replay_OpFaint,
};

// The battle outcome of each REPLAY_OUTCOME_*. A tie and an unknown end are draws.
static const u8 sOutcomes[] =
{
    [REPLAY_OUTCOME_NEAR_WON] = B_OUTCOME_WON,
    [REPLAY_OUTCOME_FAR_WON]  = B_OUTCOME_LOST,
    [REPLAY_OUTCOME_TIE]      = B_OUTCOME_DREW,
    [REPLAY_OUTCOME_UNKNOWN]  = B_OUTCOME_DREW,
};

// The battler of each side: a singles battle has one on each.
static const u8 sSidePositions[] =
{
    [REPLAY_SIDE_NEAR] = B_POSITION_PLAYER_LEFT,
    [REPLAY_SIDE_FAR]  = B_POSITION_OPPONENT_LEFT,
};

// The status1 of each REPLAY_STATUS_*. The stream gives no sleep turns, and the status icon shows
// sleep only while turns are left, so a sleeping mon gets three.
static const u32 sStatus1[] =
{
    [REPLAY_STATUS_NONE] = 0,
    [REPLAY_STATUS_SLP]  = STATUS1_SLEEP_TURN(3),
    [REPLAY_STATUS_PSN]  = STATUS1_POISON,
    [REPLAY_STATUS_BRN]  = STATUS1_BURN,
    [REPLAY_STATUS_FRZ]  = STATUS1_FREEZE,
    [REPLAY_STATUS_PAR]  = STATUS1_PARALYSIS,
    [REPLAY_STATUS_TOX]  = STATUS1_TOXIC_POISON,
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

    if (gBattleControllerExecFlags || IsTextPrinterActiveOnWindow(B_WIN_MSG))
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

// After END in the tests: the test runner checks the battle while it is still up, then the battle
// is left as a B press leaves a recorded battle (BattleMainCB2). gMain.savedCallback runs after
// CB2_QuitRecordedBattle.
static void Replay_Exit(void)
{
#if TESTING
    ReplayTest_AtEnd();
#endif
    gBattleMainFunc = Replay_Hold;
    ResetPaletteFadeControl();
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    SetMainCallback2(CB2_QuitRecordedBattle);
}

// END: gBattleOutcome, then hold the scene or, on the next frame, once END counts as done, leave
// the battle.
static bool32 Op_End(const volatile u8 *operands, u32 step)
{
    gBattleOutcome = sOutcomes[operands[0]];
    gReplayProgress.finished = TRUE;
    if (sReplay.end == REPLAY_EXIT_AT_END)
        gBattleMainFunc = Replay_Exit;
    else
        gBattleMainFunc = Replay_Hold;
    return TRUE;
}

// TURN: the number of the turn that starts.
static bool32 Op_Turn(const volatile u8 *operands, u32 step)
{
    gReplayProgress.turn = Replay_ReadU16(operands);
    return TRUE;
}

u32 Replay_GetBattler(u32 side)
{
    return GetBattlerAtPosition(sSidePositions[side]);
}

void Replay_Wait(u32 frames)
{
    sReplay.wait = frames;
}

// A mon takes the field: its party slot gets the stream's HP, at most its max HP, and status, and
// the battler's battle mon is made from it, as the engine does when a mon enters.
static void PutMonOnField(u32 battler, u32 slot, u32 hp, u32 status)
{
    struct Pokemon *mon = &GetBattlerParty(battler)[slot];
    u32 status1 = sStatus1[status];

    hp = min(hp, GetMonData(mon, MON_DATA_MAX_HP));
    SetMonData(mon, MON_DATA_HP, &hp);
    SetMonData(mon, MON_DATA_STATUS, &status1);
    gBattlerPartyIndexes[battler] = slot;
    PokemonToBattleMon(mon, &gBattleMons[battler]);
}

// PRINT: the backend's finished text, broken into the text box's lines with scroll prompts as
// BattleStringExpandPlaceholders breaks the engine's messages. The test runner records it, as
// BtlController_HandlePrintString does, and headless tests skip the window. A recorded battle
// scrolls the text by itself; the op ends once the printer is done and B_WAIT_TIME_LONG frames
// have passed, as after a battle script's waitmessage.
static bool32 Op_Print(const volatile u8 *operands, u32 step)
{
    u32 i;

    if (step != 0)
        return TRUE;
    for (i = 0; operands[i] != EOS; i++)
        gDisplayedStringBattle[i] = operands[i];
    gDisplayedStringBattle[i] = EOS;
    BreakStringAutomatic(gDisplayedStringBattle, BATTLE_MSG_MAX_WIDTH, BATTLE_MSG_MAX_LINES, FONT_NORMAL, SHOW_SCROLL_PROMPT);
    if (gTestRunnerEnabled)
    {
        TestRunner_Battle_RecordMessage(gDisplayedStringBattle);
        if (gTestRunnerHeadless)
            return TRUE;
    }
    gBattle_BG0_X = 0;
    gBattle_BG0_Y = 0;
    BattlePutTextOnWindow(gDisplayedStringBattle, B_WIN_MSG);
    Replay_Wait(B_WAIT_TIME_LONG);
    return FALSE;
}

// INTRO: the game's own intro (DoBattleIntro, saved by Replay_TakeOverBattleMain) up to its first
// text. It loads the battle mons, slides the scene in, and draws both trainers and their party
// summaries; the texts and send-outs after it come as PRINT and SEND_OUT.
static bool32 Op_Intro(const volatile u8 *operands, u32 step)
{
    if (gBattleStruct->eventState.battleIntro >= BATTLE_INTRO_STATE_INTRO_TEXT)
        return TRUE;
    sReplay.upstreamIntro();
    return FALSE;
}

// SEND_OUT: the trainer throws the mon's ball at the start of the battle, as DoBattleIntro does
// for each side (BATTLE_INTRO_STATE_TRAINER_1_SEND_OUT_ANIM, _PRINT_PLAYER_1_SEND_OUT_TEXT).
static bool32 Op_SendOut(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);

    if (step != 0)
        return TRUE;
    PutMonOnField(battler, operands[1], Replay_ReadU16(operands + 2), operands[4]);
    BtlController_EmitIntroTrainerBallThrow(battler, B_COMM_TO_CONTROLLER);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
