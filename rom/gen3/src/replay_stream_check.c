#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "data.h"
#include "replay_interpreter.h"
#include "replay_stream.h"
#include "constants/abilities.h"
#include "constants/characters.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/trainers.h"

// Checking an instruction stream (replay_stream.h) for the interpreter (#6).
// Replay_ValidateStream checks the whole stream before a battle starts: the header, the team
// tables, each instruction's size and operands, and then the order rules (ValidateOrder). What it
// lets through, the interpreter can play without checks. It reads the stream through replay_stream.c.

// The kinds of operand, in the byte order of each op.
enum ReplayOperand
{
    OPERAND_NONE, // the end of an op's operands
    OPERAND_U8,
    OPERAND_U16,
    OPERAND_S8,
    OPERAND_FLAG,
    OPERAND_SIDE,
    OPERAND_SLOT, // a party slot of the last side before it, which holds a mon
    OPERAND_OUTCOME,
    OPERAND_STATUS,
    OPERAND_EFFECTIVENESS,
    OPERAND_STAT,
    OPERAND_ARROWS,
    OPERAND_ANIM,
    OPERAND_WEATHER,
    OPERAND_VOLATILE,
    OPERAND_MOVE,
    OPERAND_ABILITY,
    OPERAND_ITEM,
    OPERAND_SPECIES,
};

#define MAX_OPERANDS 4

// The size of an op whose size byte gives its length: PRINT.
#define SIZE_VARIABLE 0x100

struct ReplayOpFormat
{
    u16 size; // the op's size byte, or SIZE_VARIABLE
    u8 operands[MAX_OPERANDS];
};

struct ReplayOperandRange
{
    u16 min;
    u16 max;
    u8 width;
};

// Every op of the format; replay_stream.h numbers them without gaps.
static const struct ReplayOpFormat sOpFormats[] =
{
    [REPLAY_OP_END]            = { REPLAY_OP_END_SIZE,            { OPERAND_OUTCOME } },
    [REPLAY_OP_TURN]           = { REPLAY_OP_TURN_SIZE,           { OPERAND_U16 } },
    [REPLAY_OP_PRINT]          = { SIZE_VARIABLE },
    [REPLAY_OP_INTRO]          = { REPLAY_OP_INTRO_SIZE },
    [REPLAY_OP_SEND_OUT]       = { REPLAY_OP_SEND_OUT_SIZE,       { OPERAND_SIDE, OPERAND_SLOT, OPERAND_U16, OPERAND_STATUS } },
    [REPLAY_OP_WITHDRAW]       = { REPLAY_OP_WITHDRAW_SIZE,       { OPERAND_SIDE } },
    [REPLAY_OP_SWITCH_IN]      = { REPLAY_OP_SWITCH_IN_SIZE,      { OPERAND_SIDE, OPERAND_SLOT, OPERAND_U16, OPERAND_STATUS } },
    [REPLAY_OP_MOVE]           = { REPLAY_OP_MOVE_SIZE,           { OPERAND_SIDE, OPERAND_SIDE, OPERAND_MOVE, OPERAND_U8 } },
    [REPLAY_OP_HIT]            = { REPLAY_OP_HIT_SIZE,            { OPERAND_SIDE, OPERAND_EFFECTIVENESS } },
    [REPLAY_OP_HP]             = { REPLAY_OP_HP_SIZE,             { OPERAND_SIDE, OPERAND_U16 } },
    [REPLAY_OP_FAINT]          = { REPLAY_OP_FAINT_SIZE,          { OPERAND_SIDE } },
    [REPLAY_OP_STATUS]         = { REPLAY_OP_STATUS_SIZE,         { OPERAND_SIDE, OPERAND_SLOT, OPERAND_STATUS } },
    [REPLAY_OP_STAT]           = { REPLAY_OP_STAT_SIZE,           { OPERAND_SIDE, OPERAND_STAT, OPERAND_S8, OPERAND_ARROWS } },
    [REPLAY_OP_ANIM]           = { REPLAY_OP_ANIM_SIZE,           { OPERAND_SIDE, OPERAND_ANIM } },
    [REPLAY_OP_WEATHER]        = { REPLAY_OP_WEATHER_SIZE,        { OPERAND_WEATHER } },
    [REPLAY_OP_VOLATILE]       = { REPLAY_OP_VOLATILE_SIZE,       { OPERAND_SIDE, OPERAND_VOLATILE, OPERAND_FLAG } },
    [REPLAY_OP_ABILITY]        = { REPLAY_OP_ABILITY_SIZE,        { OPERAND_SIDE, OPERAND_ABILITY, OPERAND_FLAG } },
    [REPLAY_OP_ITEM]           = { REPLAY_OP_ITEM_SIZE,           { OPERAND_SIDE, OPERAND_SLOT, OPERAND_ITEM } },
    [REPLAY_OP_ITEM_POP_UP]    = { REPLAY_OP_ITEM_POP_UP_SIZE,    { OPERAND_SIDE, OPERAND_ITEM } },
    [REPLAY_OP_TRAP_TURN]      = { REPLAY_OP_TRAP_TURN_SIZE,      { OPERAND_SIDE, OPERAND_MOVE } },
    [REPLAY_OP_FLUSH_TEXT_BOX] = { REPLAY_OP_FLUSH_TEXT_BOX_SIZE },
    [REPLAY_OP_FORM_CHANGE]    = { REPLAY_OP_FORM_CHANGE_SIZE,    { OPERAND_SIDE, OPERAND_SPECIES } },
    [REPLAY_OP_SHOW_MON]       = { REPLAY_OP_SHOW_MON_SIZE,       { OPERAND_SIDE } },
};

STATIC_ASSERT(ARRAY_COUNT(sOpFormats) == REPLAY_OP_SHOW_MON + 1, ReplayOpFormatsCoverTheFormat);

// The values each kind allows. The stream's own enums are numbered without gaps.
static const struct ReplayOperandRange sOperandRanges[] =
{
    [OPERAND_U8]            = { 0, 0xFF, 1 },
    [OPERAND_U16]           = { 0, 0xFFFF, 2 },
    [OPERAND_S8]            = { 0, 0xFF, 1 },
    [OPERAND_FLAG]          = { FALSE, TRUE, 1 },
    [OPERAND_SIDE]          = { REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, 1 },
    [OPERAND_SLOT]          = { 0, REPLAY_STREAM_PARTY_SIZE - 1, 1 },
    [OPERAND_OUTCOME]       = { REPLAY_OUTCOME_NEAR_WON, REPLAY_OUTCOME_UNKNOWN, 1 },
    [OPERAND_STATUS]        = { REPLAY_STATUS_NONE, REPLAY_STATUS_TOX, 1 },
    [OPERAND_EFFECTIVENESS] = { REPLAY_EFFECTIVENESS_NORMAL, REPLAY_EFFECTIVENESS_RESISTED, 1 },
    [OPERAND_STAT]          = { REPLAY_STAT_ATK, REPLAY_STAT_EVASION, 1 },
    [OPERAND_ARROWS]        = { REPLAY_ARROWS_NONE, REPLAY_ARROWS_SEVERAL, 1 },
    [OPERAND_ANIM]          = { REPLAY_ANIM_SUBSTITUTE_FADE, REPLAY_ANIM_SNOW_CONTINUES, 1 },
    [OPERAND_WEATHER]       = { REPLAY_WEATHER_NONE, REPLAY_WEATHER_SNOW, 1 },
    [OPERAND_VOLATILE]      = { REPLAY_VOLATILE_SUBSTITUTE, REPLAY_VOLATILE_SUBSTITUTE, 1 },
    [OPERAND_MOVE]          = { MOVE_NONE, MOVES_COUNT_ALL - 1, 2 },
    [OPERAND_ABILITY]       = { ABILITY_NONE, ABILITIES_COUNT - 1, 2 },
    [OPERAND_ITEM]          = { ITEM_NONE, ITEMS_COUNT - 1, 2 },
    [OPERAND_SPECIES]       = { SPECIES_NONE + 1, NUM_SPECIES - 1, 2 },
};

// A glyph the text printer draws. The bytes from CHAR_DYNAMIC up are control codes, which could
// wait for a button or read a placeholder; the backend's charset has none of them.
static bool32 IsGlyph(u32 byte)
{
    return byte < CHAR_DYNAMIC;
}

// A name field: glyphs, then EOS before the field ends.
static bool32 IsName(const volatile u8 *name, u32 length)
{
    u32 i;

    for (i = 0; i < length && name[i] != EOS; i++)
    {
        if (!IsGlyph(name[i]))
            return FALSE;
    }
    return i < length;
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

// The format's limit is the pinned expansion's INSTANT_HP_BAR_DROP: an HP bar change of that value
// empties the bar at once.
STATIC_ASSERT(REPLAY_MON_MAX_HP_LIMIT == INSTANT_HP_BAR_DROP, ReplayMonMaxHpLimitIsInstantHpBarDrop);

// A mon the game can make: a species of the expansion, a level, a max HP below
// REPLAY_MON_MAX_HP_LIMIT, and gender, shininess and nickname inside the format.
static bool32 IsMon(const volatile u8 *mon)
{
    return Replay_ReadU16(mon + REPLAY_MON_OFFSET_SPECIES) < NUM_SPECIES
        && Replay_ReadU16(mon + REPLAY_MON_OFFSET_MAX_HP) != 0
        && Replay_ReadU16(mon + REPLAY_MON_OFFSET_MAX_HP) < REPLAY_MON_MAX_HP_LIMIT
        && mon[REPLAY_MON_OFFSET_LEVEL] >= 1
        && mon[REPLAY_MON_OFFSET_LEVEL] <= MAX_LEVEL
        && mon[REPLAY_MON_OFFSET_GENDER] <= REPLAY_GENDER_NONE
        && mon[REPLAY_MON_OFFSET_SHINY] <= TRUE
        && IsName(mon + REPLAY_MON_OFFSET_NICKNAME, REPLAY_MON_NICKNAME_LENGTH);
}

// A trainer pic the side can draw: the near side draws its back pic and the far side its front
// pic (#20). gTrainerPicInfo holds TRAINER_PIC_COUNT entries (data.h); only a few have a back
// pic, and POKEDUDE and OLD_MAN have no front pic.
static bool32 IsTrainerPicOfSide(u32 pic, u32 side)
{
    if (pic >= TRAINER_PIC_COUNT)
        return FALSE;
    if (side == REPLAY_SIDE_NEAR)
        return gTrainerPicInfo[pic].backPic != NULL;
    return gTrainerPicInfo[pic].frontPic != NULL;
}

static enum ReplayError ValidateTeams(const volatile u8 *stream)
{
    u32 side, slot, mons;

    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
    {
        if (!IsName(Replay_GetTrainer(stream, side) + REPLAY_TRAINER_OFFSET_NAME, REPLAY_TRAINER_NAME_LENGTH))
            return REPLAY_ERROR_TEAM;
        if (!IsTrainerPicOfSide(Replay_ReadU16(Replay_GetTrainer(stream, side) + REPLAY_TRAINER_OFFSET_TRAINER_PIC), side))
            return REPLAY_ERROR_TEAM;
        for (mons = 0, slot = 0; slot < REPLAY_STREAM_PARTY_SIZE; slot++)
        {
            if (!Replay_HoldsMon(stream, side, slot))
                continue;
            if (!IsMon(Replay_GetMon(stream, side, slot)))
                return REPLAY_ERROR_TEAM;
            mons++;
        }
        if (mons == 0)
            return REPLAY_ERROR_TEAM;
    }
    return REPLAY_ERROR_NONE;
}

static enum ReplayError ValidateOperands(const volatile u8 *stream, const volatile u8 *operands, const u8 *kinds)
{
    u32 i, value, side = REPLAY_SIDE_NEAR;

    for (i = 0; i < MAX_OPERANDS && kinds[i] != OPERAND_NONE; i++)
    {
        const struct ReplayOperandRange *range = &sOperandRanges[kinds[i]];

        value = (range->width == 2) ? Replay_ReadU16(operands) : operands[0];
        if (value < range->min || value > range->max)
            return REPLAY_ERROR_OPERAND;
        if (kinds[i] == OPERAND_SIDE)
            side = value;
        if (kinds[i] == OPERAND_SLOT && !Replay_HoldsMon(stream, side, value))
            return REPLAY_ERROR_OPERAND;
        operands += range->width;
    }
    return REPLAY_ERROR_NONE;
}

// PRINT's text: at least one glyph, and EOS as its last byte only.
static enum ReplayError ValidatePrint(const volatile u8 *text, u32 size)
{
    u32 i;

    if (size < REPLAY_PRINT_MIN_SIZE)
        return REPLAY_ERROR_SIZE;
    for (i = 0; i < size - 1; i++)
    {
        if (!IsGlyph(text[i]))
            return REPLAY_ERROR_OPERAND;
    }
    return text[size - 1] == EOS ? REPLAY_ERROR_NONE : REPLAY_ERROR_OPERAND;
}

// One instruction at instructions[at]: an op of the format, its size byte, its operands, and its
// end inside the span.
static enum ReplayError ValidateInstruction(const volatile u8 *stream, const volatile u8 *instructions, u32 length, u32 at)
{
    const struct ReplayOpFormat *format;
    enum ReplayError error;
    u32 op, size;

    if (length - at < REPLAY_INSTRUCTION_HEADER_SIZE)
        return REPLAY_ERROR_OVERRUN;
    op = instructions[at];
    size = instructions[at + 1];
    if (size > length - at - REPLAY_INSTRUCTION_HEADER_SIZE)
        return REPLAY_ERROR_OVERRUN;
    if (op >= ARRAY_COUNT(sOpFormats))
        return REPLAY_ERROR_OP;
    format = &sOpFormats[op];
    if (format->size == SIZE_VARIABLE)
        error = ValidatePrint(instructions + at + REPLAY_INSTRUCTION_HEADER_SIZE, size);
    else if (size != format->size)
        error = REPLAY_ERROR_SIZE;
    else
        error = ValidateOperands(stream, instructions + at + REPLAY_INSTRUCTION_HEADER_SIZE, format->operands);
    return error;
}

static enum ReplayError ValidateInstructions(const volatile u8 *stream, u16 *count)
{
    const volatile u8 *instructions = stream + Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET);
    u32 length = Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH);
    enum ReplayError error;
    bool32 ended = FALSE;
    u32 at = 0;

    while (at < length)
    {
        if (ended)
            return REPLAY_ERROR_NO_END;
        error = ValidateInstruction(stream, instructions, length, at);
        if (error != REPLAY_ERROR_NONE)
            return error;
        ended = (instructions[at] == REPLAY_OP_END);
        at += REPLAY_INSTRUCTION_HEADER_SIZE + instructions[at + 1];
        (*count)++;
    }
    return ended ? REPLAY_ERROR_NONE : REPLAY_ERROR_NO_END;
}

// Where a side's battler is, for the order rules (replay_stream.h).
enum ReplayPresence
{
    PRESENCE_NONE, // no battler sent out yet
    PRESENCE_OUT,
    PRESENCE_LEFT, // its battler left by WITHDRAW or FAINT
};

// The masks hold a bit per op and per animation, and each names its ops as format.ts does.
STATIC_ASSERT(ARRAY_COUNT(sOpFormats) <= 32, ReplayOrderOpsFitTheMask);
STATIC_ASSERT(REPLAY_ANIM_SNOW_CONTINUES < 32, ReplayOrderAnimsFitTheMask);
STATIC_ASSERT(REPLAY_ORDER_ON_FIELD_OPS == ((1 << REPLAY_OP_WITHDRAW) | (1 << REPLAY_OP_MOVE) | (1 << REPLAY_OP_HIT) | (1 << REPLAY_OP_HP) | (1 << REPLAY_OP_FAINT) | (1 << REPLAY_OP_STAT) | (1 << REPLAY_OP_ANIM) | (1 << REPLAY_OP_VOLATILE) | (1 << REPLAY_OP_ABILITY) | (1 << REPLAY_OP_ITEM_POP_UP) | (1 << REPLAY_OP_TRAP_TURN) | (1 << REPLAY_OP_FORM_CHANGE) | (1 << REPLAY_OP_SHOW_MON)), ReplayOrderOnFieldOps);
STATIC_ASSERT(REPLAY_ORDER_FREE_ANIMS == ((1 << REPLAY_ANIM_RAIN_CONTINUES) | (1 << REPLAY_ANIM_SUN_CONTINUES) | (1 << REPLAY_ANIM_SANDSTORM_CONTINUES) | (1 << REPLAY_ANIM_HAIL_CONTINUES) | (1 << REPLAY_ANIM_SNOW_CONTINUES)), ReplayOrderFreeAnims);

static bool32 IsInMask(u32 mask, u32 bit)
{
    return (mask >> bit) & 1;
}

// SEND_OUT puts a side's first battler out, SWITCH_IN the next one after WITHDRAW or FAINT.
static enum ReplayError ValidateEntry(u8 *presence, u32 op, u32 side)
{
    u32 before = (op == REPLAY_OP_SEND_OUT) ? PRESENCE_NONE : PRESENCE_LEFT;

    if (presence[side] != before)
        return REPLAY_ERROR_ORDER;
    presence[side] = PRESENCE_OUT;
    return REPLAY_ERROR_NONE;
}

// Every side operand of the op names a side with its battler out, unless the op is an ANIM of
// REPLAY_ORDER_FREE_ANIMS. WITHDRAW and FAINT then take the battler off.
static enum ReplayError ValidateOnField(u8 *presence, u32 op, const volatile u8 *operands)
{
    const u8 *kinds = sOpFormats[op].operands;
    const volatile u8 *operand = operands;
    bool32 sidesOut = TRUE;
    u32 i;

    for (i = 0; i < MAX_OPERANDS && kinds[i] != OPERAND_NONE; i++)
    {
        if (kinds[i] == OPERAND_SIDE && presence[*operand] != PRESENCE_OUT)
            sidesOut = FALSE;
        if (kinds[i] == OPERAND_ANIM && IsInMask(REPLAY_ORDER_FREE_ANIMS, *operand))
            return REPLAY_ERROR_NONE;
        operand += sOperandRanges[kinds[i]].width;
    }
    if (!sidesOut)
        return REPLAY_ERROR_ORDER;
    // The side is the one operand of WITHDRAW and FAINT.
    if (op == REPLAY_OP_WITHDRAW || op == REPLAY_OP_FAINT)
        presence[operands[0]] = PRESENCE_LEFT;
    return REPLAY_ERROR_NONE;
}

// One instruction at byte at of the instructions, under the order rules.
static enum ReplayError ValidateOrderOf(u8 *presence, const volatile u8 *instruction, u32 at, bool32 introduced)
{
    u32 op = instruction[0];
    const volatile u8 *operands = instruction + REPLAY_INSTRUCTION_HEADER_SIZE;

    if (op == REPLAY_OP_INTRO)
        return (at == 0) ? REPLAY_ERROR_NONE : REPLAY_ERROR_ORDER;
    if (op == REPLAY_OP_SEND_OUT && !introduced)
        return REPLAY_ERROR_ORDER;
    // The side is the first operand of SEND_OUT and SWITCH_IN.
    if (op == REPLAY_OP_SEND_OUT || op == REPLAY_OP_SWITCH_IN)
        return ValidateEntry(presence, op, operands[0]);
    if (IsInMask(REPLAY_ORDER_ON_FIELD_OPS, op))
        return ValidateOnField(presence, op, operands);
    return REPLAY_ERROR_NONE;
}

// The second pass, over instructions the first pass let through: each one keeps the order rules
// of replay_stream.h. END comes last, so the presence after the pass gives the sides out at END.
static enum ReplayError ValidateOrder(const volatile u8 *stream, u8 *sidesOut)
{
    const volatile u8 *instructions = stream + Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET);
    u32 length = Replay_ReadU32(stream + REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH);
    u8 presence[REPLAY_STREAM_SIDE_COUNT] = { PRESENCE_NONE, PRESENCE_NONE };
    bool32 introduced = (instructions[0] == REPLAY_OP_INTRO);
    enum ReplayError error = REPLAY_ERROR_NONE;
    u32 at, side;

    for (at = 0; at < length && error == REPLAY_ERROR_NONE; at += REPLAY_INSTRUCTION_HEADER_SIZE + instructions[at + 1])
        error = ValidateOrderOf(presence, instructions + at, at, introduced);
    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
    {
        if (presence[side] == PRESENCE_OUT)
            *sidesOut |= 1u << side;
    }
    return error;
}

enum ReplayError Replay_ValidateStream(const volatile u8 *stream, u32 length, struct ReplayStreamFacts *facts)
{
    enum ReplayError error = ValidateHeader(stream, length);

    memset(facts, 0, sizeof(*facts));
    if (error == REPLAY_ERROR_NONE)
        error = ValidateTeams(stream);
    if (error == REPLAY_ERROR_NONE)
        error = ValidateInstructions(stream, &facts->count);
    if (error == REPLAY_ERROR_NONE)
        error = ValidateOrder(stream, &facts->sidesOutAtEnd);
    return error;
}

enum ReplayError Replay_Validate(const volatile u8 *stream, u32 length)
{
    struct ReplayStreamFacts facts;
    return Replay_ValidateStream(stream, length, &facts);
}
