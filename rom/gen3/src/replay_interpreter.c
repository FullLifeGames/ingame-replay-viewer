#include "global.h"
#include "battle.h"
#include "battle_main.h"
#include "palette.h"
#include "replay_interpreter.h"
#include "replay_stream.h"
#include "constants/rgb.h"

// The ROM interpreter (#6). Replay_Load checks the whole stream first, so a refusal never starts a
// battle and the step functions below can read their operands without checks.
//
// Replay_RunBattle stands in for the battle engine's gBattleMainFunc: once a frame, while no
// controller is busy and no wait runs, it runs one step of the current op. An op that needs two
// controller commands for one battler emits one, returns FALSE, and emits the other on its next
// step. When an op returns TRUE, the next op starts on the next frame.

typedef bool32 (*ReplayOpFunc)(const volatile u8 *operands, u32 step);

struct ReplayOpInfo
{
    ReplayOpFunc run;
    u8 size;
};

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

// An op without a row is one this interpreter does not play, and Replay_Validate refuses it.
static const struct ReplayOpInfo sOps[] =
{
    [REPLAY_OP_END]  = { Op_End,  REPLAY_OP_END_SIZE },
    [REPLAY_OP_TURN] = { Op_Turn, REPLAY_OP_TURN_SIZE },
};

// The battle outcome of each REPLAY_OUTCOME_*. A tie and an unknown end are draws.
static const u8 sOutcomes[] =
{
    [REPLAY_OUTCOME_NEAR_WON] = B_OUTCOME_WON,
    [REPLAY_OUTCOME_FAR_WON]  = B_OUTCOME_LOST,
    [REPLAY_OUTCOME_TIE]      = B_OUTCOME_DREW,
    [REPLAY_OUTCOME_UNKNOWN]  = B_OUTCOME_DREW,
};

u32 Replay_ReadU16(const volatile u8 *bytes)
{
    return bytes[0] | (bytes[1] << 8);
}

u32 Replay_ReadU32(const volatile u8 *bytes)
{
    return Replay_ReadU16(bytes) | (Replay_ReadU16(bytes + 2) << 16);
}

static const struct ReplayOpInfo *GetOpInfo(u32 op)
{
    if (op >= ARRAY_COUNT(sOps) || sOps[op].run == NULL)
        return NULL;
    return &sOps[op];
}

static enum ReplayError ValidateHeader(const volatile u8 *stream, u32 length)
{
    u32 offset, span;

    if (length == 0)
        return REPLAY_ERROR_EMPTY;
    if (length < REPLAY_STREAM_HEADER_SIZE)
        return REPLAY_ERROR_HEADER;
    if (Replay_ReadU16(stream + REPLAY_STREAM_OFFSET_VERSION) != REPLAY_STREAM_VERSION)
        return REPLAY_ERROR_VERSION;
    if (Replay_ReadU16(stream + REPLAY_STREAM_OFFSET_HEADER_SIZE) != REPLAY_STREAM_HEADER_SIZE
     || stream[REPLAY_STREAM_OFFSET_TRAINER_SIZE] != REPLAY_TRAINER_SIZE
     || stream[REPLAY_STREAM_OFFSET_MON_SIZE] != REPLAY_MON_SIZE)
        return REPLAY_ERROR_HEADER;
    offset = Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET);
    span = Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH);
    if (offset < REPLAY_STREAM_TABLES_END || offset > length || span > length - offset)
        return REPLAY_ERROR_HEADER;
    return REPLAY_ERROR_NONE;
}

// One instruction at instructions[at]: its size byte fits the op, and it ends inside the span.
static enum ReplayError ValidateInstruction(const volatile u8 *instructions, u32 length, u32 at)
{
    const struct ReplayOpInfo *info;
    u32 size;

    if (length - at < REPLAY_INSTRUCTION_HEADER_SIZE)
        return REPLAY_ERROR_OVERRUN;
    size = instructions[at + 1];
    if (size > length - at - REPLAY_INSTRUCTION_HEADER_SIZE)
        return REPLAY_ERROR_OVERRUN;
    info = GetOpInfo(instructions[at]);
    if (info == NULL)
        return REPLAY_ERROR_OP;
    if (size != info->size)
        return REPLAY_ERROR_SIZE;
    return REPLAY_ERROR_NONE;
}

static enum ReplayError ValidateInstructions(const volatile u8 *instructions, u32 length, u16 *count)
{
    enum ReplayError error;
    bool32 ended = FALSE;
    u32 at = 0;

    *count = 0;
    while (at < length)
    {
        if (ended)
            return REPLAY_ERROR_NO_END;
        error = ValidateInstruction(instructions, length, at);
        if (error != REPLAY_ERROR_NONE)
            return error;
        ended = (instructions[at] == REPLAY_OP_END);
        at += REPLAY_INSTRUCTION_HEADER_SIZE + instructions[at + 1];
        (*count)++;
    }
    return ended ? REPLAY_ERROR_NONE : REPLAY_ERROR_NO_END;
}

static enum ReplayError ValidateStream(const volatile u8 *stream, u32 length, u16 *count)
{
    enum ReplayError error = ValidateHeader(stream, length);
    const volatile u8 *instructions;

    *count = 0;
    if (error != REPLAY_ERROR_NONE)
        return error;
    instructions = stream + Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET);
    return ValidateInstructions(instructions, Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH), count);
}

enum ReplayError Replay_Validate(const volatile u8 *stream, u32 length)
{
    u16 count;
    return ValidateStream(stream, length, &count);
}

enum ReplayError Replay_Load(const volatile u8 *stream, u32 length, enum ReplayEnd end)
{
    u16 count;
    enum ReplayError error = ValidateStream(stream, length, &count);

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
    if (!sOps[instruction[0]].run(instruction + REPLAY_INSTRUCTION_HEADER_SIZE, sReplay.step))
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
    gBattleOutcome = sOutcomes[operands[0] < ARRAY_COUNT(sOutcomes) ? operands[0] : REPLAY_OUTCOME_UNKNOWN];
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
