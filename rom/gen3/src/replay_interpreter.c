#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "battle_main.h"
#include "battle_message.h"
#include "battle_util.h"
#include "line_break.h"
#include "palette.h"
#include "pokemon.h"
#include "recorded_battle.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "test_runner.h"
#include "text.h"
#include "constants/battle.h"
#include "constants/characters.h"
#include "constants/moves.h"
#include "constants/rgb.h"

// The ROM interpreter (#6). Replay_Load checks the whole stream first (replay_stream_check.c), so a
// refusal never starts a battle and the step functions below can read their operands without
// checks.
//
// Replay_RunBattle stands in for the battle engine's gBattleMainFunc: once a frame, while no
// controller is busy, no text prints and no wait runs, it runs one step of the current op. An op that needs two
// controller commands for one battler emits one, returns FALSE, and emits the other on its next
// step. When an op returns TRUE, the next op starts on the next frame.

struct ReplayState
{
    const volatile u8 *stream;
    const volatile u8 *instructions;
    u32 length;
    u32 at;
    void (*upstreamIntro)(void);
    u16 wait;
    u8 step;
    u8 lastOp; // the op that ended last, REPLAY_OP_END (0) before the first
    u8 end; // enum ReplayEnd
    u8 sidesOut; // a bit for each REPLAY_SIDE_* whose battler is out
    bool8 loaded;
};

static bool32 Op_End(const volatile u8 *operands, u32 step);
static bool32 Op_Turn(const volatile u8 *operands, u32 step);
static bool32 Op_Print(const volatile u8 *operands, u32 step);
static bool32 Op_FlushTextBox(const volatile u8 *operands, u32 step);
static bool32 Op_Intro(const volatile u8 *operands, u32 step);
static bool32 Op_SendOut(const volatile u8 *operands, u32 step);
static void Replay_RunBattle(void);
static void Replay_Hold(void);
static void Replay_Exit(void);

EWRAM_DATA struct ReplayProgress gReplayProgress = {0};
static EWRAM_DATA struct ReplayState sReplay = {0};

// The step function of each op of the format. Replay_Validate refuses any other op.
static const ReplayOpFunc sOps[] =
{
    [REPLAY_OP_END]            = Op_End,
    [REPLAY_OP_TURN]           = Op_Turn,
    [REPLAY_OP_PRINT]          = Op_Print,
    [REPLAY_OP_INTRO]          = Op_Intro,
    [REPLAY_OP_SEND_OUT]       = Op_SendOut,
    [REPLAY_OP_MOVE]           = Replay_OpMove,
    [REPLAY_OP_HIT]            = Replay_OpHit,
    [REPLAY_OP_HP]             = Replay_OpHp,
    [REPLAY_OP_FAINT]          = Replay_OpFaint,
    [REPLAY_OP_WITHDRAW]       = Replay_OpWithdraw,
    [REPLAY_OP_SWITCH_IN]      = Replay_OpSwitchIn,
    [REPLAY_OP_STATUS]         = Replay_OpStatus,
    [REPLAY_OP_STAT]           = Replay_OpStat,
    [REPLAY_OP_ANIM]           = Replay_OpAnim,
    [REPLAY_OP_WEATHER]        = Replay_OpWeather,
    [REPLAY_OP_VOLATILE]       = Replay_OpVolatile,
    [REPLAY_OP_ABILITY]        = Replay_OpAbility,
    [REPLAY_OP_ITEM]           = Replay_OpItem,
    [REPLAY_OP_ITEM_POP_UP]    = Replay_OpItemPopUp,
    [REPLAY_OP_TRAP_TURN]      = Replay_OpTrapTurn,
    [REPLAY_OP_FLUSH_TEXT_BOX] = Op_FlushTextBox,
    [REPLAY_OP_FORM_CHANGE]    = Replay_OpFormChange,
    [REPLAY_OP_SHOW_MON]       = Replay_OpShowMon,
};

STATIC_ASSERT(ARRAY_COUNT(sOps) == REPLAY_OP_SHOW_MON + 1, ReplayOpsCoverTheFormat);

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
    sReplay.stream = stream;
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

// A replay carries HP as percentages, not as the mon's numbers, so it shows the HP bar alone on
// both sides (docs/plan.md, "HP display").
bool32 Replay_HidesHpNumbers(void)
{
    return sReplay.loaded;
}

void Replay_Unload(void)
{
    memset(&sReplay, 0, sizeof(sReplay));
}

// gBattleMainFunc is DoBattleIntro here; the INTRO op runs it through sReplay.upstreamIntro.
// BattleMainCB2 quits a recorded battle on a held B until its playback counts as finished, so the
// playback counts as finished from here on and B does nothing during the replay or after END
// (#68). Only InitBattleControllers resets it (RecordedBattle_Init), and that ran before.
void Replay_TakeOverBattleMain(void)
{
    if (!sReplay.loaded)
        return;
    sReplay.upstreamIntro = gBattleMainFunc;
    gBattleMainFunc = Replay_RunBattle;
    gCurrentMove = MOVE_NONE;
    gReplayProgress.playing = TRUE;
    RecordedBattle_SetPlaybackFinished();
#if TESTING
    ReplayTest_AtFrame();
#endif
}

// The KO animation (#24). When a mon faints, the faint handler starts the animation of the mon
// that stays (AnimateMonAfterKnockout in battle_controllers.c, B_ANIMATE_MON_AFTER_KO), and the
// faint text prints while it runs. BattleScript_FaintBattler (data/battle_scripts_1.s) waits for
// it before its next step:
//     dofaintanimation BS_FAINTED
//     ...
//     printstring STRINGID_BATTLERFAINTED
//     ...
//     flushtextbox
//     waitanimation
// and Cmd_waitanimation (src/battle_script_commands.c) returns while
//     gBattleControllerExecFlags != 0 || gBattleStruct->battlerKOAnimsRunning != 0
// So the PRINT right after a FAINT, the faint text, starts during the animation, and every other op
// waits for its end, a later PRINT such as the next send-out text included. The faint handler
// (BtlController_HandleFaintAnimation in battle_controllers.c) starts the animation on each frame
// it runs. A mon in the open takes two frames, so after its faint the counter is 2 and both
// animations end on the same frame. A mon behind a substitute takes one frame more for each frame
// of B_ANIM_SUBSTITUTE_TO_MON, and the counter is a 3-bit field (battlerKOAnimsRunning:3 in
// include/battle.h), so there the count wraps and does not say how many animations run.
static bool32 Replay_WaitsForKOAnimation(u32 op, u32 step)
{
    if (step != 0 || gBattleStruct->battlerKOAnimsRunning == 0)
        return FALSE;
    return op != REPLAY_OP_PRINT || sReplay.lastOp != REPLAY_OP_FAINT;
}

// Which sides have their battler out, for the outro. The order rules (include/replay_stream.h),
// which Replay_Load checked, let SEND_OUT and SWITCH_IN put a side's battler out and WITHDRAW and
// FAINT take it off; the side is the first operand of all four.
static void KeepSidesOut(const volatile u8 *instruction)
{
    switch (instruction[0])
    {
    case REPLAY_OP_SEND_OUT:
    case REPLAY_OP_SWITCH_IN:
        sReplay.sidesOut |= 1u << instruction[REPLAY_INSTRUCTION_HEADER_SIZE];
        break;
    case REPLAY_OP_WITHDRAW:
    case REPLAY_OP_FAINT:
        sReplay.sidesOut &= ~(1u << instruction[REPLAY_INSTRUCTION_HEADER_SIZE]);
        break;
    }
}

static void Replay_RunBattle(void)
{
    const volatile u8 *instruction;

#if TESTING
    ReplayTest_AtFrame();
#endif
    if (gBattleControllerExecFlags || IsTextPrinterActiveOnWindow(B_WIN_MSG))
        return;
    if (sReplay.wait != 0)
    {
        sReplay.wait--;
        return;
    }
    instruction = sReplay.instructions + sReplay.at;
    if (Replay_WaitsForKOAnimation(instruction[0], sReplay.step))
        return;
#if TESTING
    if (sReplay.step == 0)
        ReplayTest_AtOpStart(gReplayProgress.done);
#endif
    if (!sOps[instruction[0]](instruction + REPLAY_INSTRUCTION_HEADER_SIZE, sReplay.step))
    {
        sReplay.step++;
        return;
    }
    gReplayProgress.done++;
    KeepSidesOut(instruction);
    sReplay.lastOp = instruction[0];
    sReplay.step = 0;
    sReplay.at += REPLAY_INSTRUCTION_HEADER_SIZE + instruction[1];
}

// After the outro: the screen stays black and nothing runs in the battle's main loop.
static void Replay_Hold(void)
{
}

// After END in the tests: the test runner checks the battle while it is still up, then the battle
// is left as a B press leaves a recorded battle (BattleMainCB2). gMain.savedCallback runs after
// CB2_QuitRecordedBattle.
static void Replay_Exit(void)
{
#if TESTING
    ReplayTest_AtFrame();
    ReplayTest_AtEnd();
#endif
    gBattleMainFunc = Replay_Hold;
    ResetPaletteFadeControl();
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    SetMainCallback2(CB2_QuitRecordedBattle);
}

// END: gBattleOutcome, then, from the next frame, once END counts as done, the outro
// (replay_outro.c) or, in most tests, the way out of the battle. The recorded battle's playback
// has counted as finished since the takeover, so a held B does not leave the outro (#30).
static bool32 Op_End(const volatile u8 *operands, u32 step)
{
    gBattleOutcome = sOutcomes[operands[0]];
    gReplayProgress.finished = TRUE;
    if (sReplay.end == REPLAY_EXIT_AT_END)
        gBattleMainFunc = Replay_Exit;
    else
        Replay_StartOutro(operands[0], sReplay.sidesOut);
    return TRUE;
}

void Replay_EndOutro(void)
{
    if (sReplay.end == REPLAY_OUTRO_THEN_EXIT)
        gBattleMainFunc = Replay_Exit;
    else
        gBattleMainFunc = Replay_Hold;
}

// TURN: the number of the turn that starts. No move of the last turn is still in action, as
// HandleAction_ActionFinished clears gCurrentMove after each action.
static bool32 Op_Turn(const volatile u8 *operands, u32 step)
{
    gCurrentMove = MOVE_NONE;
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

u32 Replay_GetStatus1(u32 status)
{
    return sStatus1[status];
}

// As the engine does when a mon enters: the battle mon is a copy of the party mon. The party mon
// takes the species of the stream's team table first, so a mon that left the field in another
// form (FORM_CHANGE) enters in its own, as the game's Castform does after a switch; Showdown logs
// no change back. The side is the battler's (REPLAY_SIDE_NEAR is B_SIDE_PLAYER, replay_setup.c).
void Replay_PutMonOnField(u32 battler, u32 slot, u32 hp, u32 status)
{
    struct Pokemon *mon = &GetBattlerParty(battler)[slot];
    u32 species = Replay_ReadU16(Replay_GetMon(sReplay.stream, GetBattlerSide(battler), slot) + REPLAY_MON_OFFSET_SPECIES);
    u32 status1 = sStatus1[status];

    SetMonData(mon, MON_DATA_SPECIES, &species);
    hp = min(hp, GetMonData(mon, MON_DATA_MAX_HP));
    SetMonData(mon, MON_DATA_HP, &hp);
    SetMonData(mon, MON_DATA_STATUS, &status1);
    gBattlerPartyIndexes[battler] = slot;
    PokemonToBattleMon(mon, &gBattleMons[battler]);
}

// The text is broken into the text box's lines with scroll prompts as
// BattleStringExpandPlaceholders breaks the engine's messages. The test runner records it, as
// BtlController_HandlePrintString does, and headless tests skip the window. A recorded battle
// scrolls the text by itself.
bool32 Replay_PrintText(const volatile u8 *text, u32 frames)
{
    u32 i;

    for (i = 0; text[i] != EOS; i++)
        gDisplayedStringBattle[i] = text[i];
    gDisplayedStringBattle[i] = EOS;
    BreakStringAutomatic(gDisplayedStringBattle, BATTLE_MSG_MAX_WIDTH, BATTLE_MSG_MAX_LINES, FONT_NORMAL, SHOW_SCROLL_PROMPT);
    if (gTestRunnerEnabled)
    {
        TestRunner_Battle_RecordMessage(gDisplayedStringBattle);
        if (gTestRunnerHeadless)
            return FALSE;
    }
    gBattle_BG0_X = 0;
    gBattle_BG0_Y = 0;
    BattlePutTextOnWindow(gDisplayedStringBattle, B_WIN_MSG);
    Replay_Wait(frames);
    return TRUE;
}

// The instruction after the current one. The stream ends with END, so every other op has one.
static const volatile u8 *GetNextInstruction(void)
{
    const volatile u8 *instruction = sReplay.instructions + sReplay.at;

    return instruction + REPLAY_INSTRUCTION_HEADER_SIZE + instruction[1];
}

// PRINT: the backend's finished text. The op ends once the printer is done and B_WAIT_TIME_LONG
// frames have passed, as after a battle script's waitmessage. The PRINT right before END, the end
// line, may start the victory music first.
static bool32 Op_Print(const volatile u8 *operands, u32 step)
{
    const volatile u8 *next = GetNextInstruction();

    if (step != 0)
        return TRUE;
    if (next[0] == REPLAY_OP_END)
        Replay_StartVictoryMusic(next[REPLAY_INSTRUCTION_HEADER_SIZE]);
    return !Replay_PrintText(operands, B_WAIT_TIME_LONG);
}

bool32 Replay_FlushTextBox(void)
{
    return Replay_PrintText(gText_EmptyString3, 1);
}

// FLUSH_TEXT_BOX: the text box emptied, as BattleScript_FlushMessageBox does before each later hit
// of a multi-hit move (MoveEndMultihitMove).
static bool32 Op_FlushTextBox(const volatile u8 *operands, u32 step)
{
    if (step != 0)
        return TRUE;
    return !Replay_FlushTextBox();
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
    Replay_PutMonOnField(battler, operands[1], Replay_ReadU16(operands + 2), operands[4]);
    BtlController_EmitIntroTrainerBallThrow(battler, B_COMM_TO_CONTROLLER);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
