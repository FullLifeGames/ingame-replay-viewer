#include "global.h"
#include "pokemon.h"
#include "string_util.h"
#include "test/replay_test.h"
#include "constants/characters.h"
#include "constants/species.h"
#include "constants/trainers.h"

// The stream writer of the REPLAY_TEST bodies (#7), a second encoder for the tests only: it writes
// the format of replay_stream.h into a 4 KiB buffer, and the spec of src/gen3/stream/format.ts
// keeps the numbers equal on both sides.

#define STREAM_CAPACITY 0x1000

static EWRAM_DATA u8 sStream[STREAM_CAPACITY] = {0};
static EWRAM_DATA u32 sStreamLength = 0;

static u8 *Reserve(u32 size)
{
    u8 *at = &sStream[sStreamLength];

    if (size > STREAM_CAPACITY - sStreamLength)
        Test_ExitWithResult(TEST_RESULT_INVALID, SourceLine(0), "%s:%d: the test stream is longer than %d bytes", gTestRunnerState.test->filename, SourceLine(0), STREAM_CAPACITY);
    sStreamLength += size;
    return at;
}

void ReplayStream_SetU8(u32 offset, u32 value)
{
    sStream[offset] = value;
}

void ReplayStream_SetU16(u32 offset, u32 value)
{
    sStream[offset] = value;
    sStream[offset + 1] = value >> 8;
}

void ReplayStream_SetU32(u32 offset, u32 value)
{
    ReplayStream_SetU16(offset, value);
    ReplayStream_SetU16(offset + 2, value >> 16);
}

u32 ReplayStream_TrainerOffset(u32 side)
{
    return REPLAY_STREAM_TRAINERS_OFFSET + side * REPLAY_TRAINER_SIZE;
}

u32 ReplayStream_MonOffset(u32 side, u32 slot)
{
    return REPLAY_STREAM_MONS_OFFSET + (side * REPLAY_STREAM_PARTY_SIZE + slot) * REPLAY_MON_SIZE;
}

static void WriteName(u8 *dest, const u8 *name, u32 capacity)
{
    u32 i;

    for (i = 0; i < capacity; i++)
        dest[i] = EOS;
    for (i = 0; i + 1 < capacity && name[i] != EOS; i++)
        dest[i] = name[i];
}

void ReplayStream_Trainer(u32 side, const u8 *name, u32 trainerPic)
{
    u8 *trainer = &sStream[ReplayStream_TrainerOffset(side)];

    WriteName(trainer + REPLAY_TRAINER_OFFSET_NAME, name, REPLAY_TRAINER_NAME_LENGTH);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(side) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, trainerPic);
    trainer[REPLAY_TRAINER_OFFSET_TEAM_SIZE] = 1;
}

void ReplayStream_Mon(u32 side, u32 slot, u32 species, u32 maxHp)
{
    u32 at = ReplayStream_MonOffset(side, slot);

    ReplayStream_SetU16(at + REPLAY_MON_OFFSET_SPECIES, species);
    ReplayStream_SetU16(at + REPLAY_MON_OFFSET_MAX_HP, maxHp);
    sStream[at + REPLAY_MON_OFFSET_LEVEL] = MAX_LEVEL;
    sStream[at + REPLAY_MON_OFFSET_GENDER] = REPLAY_GENDER_MALE;
    sStream[at + REPLAY_MON_OFFSET_SHINY] = FALSE;
    WriteName(&sStream[at + REPLAY_MON_OFFSET_NICKNAME], GetSpeciesName(species), REPLAY_MON_NICKNAME_LENGTH);
}

void ReplayStream_Begin(void)
{
    memset(sStream, 0, sizeof(sStream));
    sStreamLength = REPLAY_STREAM_TABLES_END;
    ReplayStream_SetU16(REPLAY_STREAM_OFFSET_VERSION, REPLAY_STREAM_VERSION);
    ReplayStream_SetU16(REPLAY_STREAM_OFFSET_HEADER_SIZE, REPLAY_STREAM_HEADER_SIZE);
    sStream[REPLAY_STREAM_OFFSET_TRAINER_SIZE] = REPLAY_TRAINER_SIZE;
    sStream[REPLAY_STREAM_OFFSET_MON_SIZE] = REPLAY_MON_SIZE;
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET, REPLAY_STREAM_TABLES_END);
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, 0);
    ReplayStream_Trainer(REPLAY_SIDE_NEAR, COMPOUND_STRING("NEAR"), TRAINER_PIC_BRENDAN);
    ReplayStream_Trainer(REPLAY_SIDE_FAR, COMPOUND_STRING("FAR"), TRAINER_PIC_MAY);
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_WOBBUFFET, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_WOBBUFFET, 100);
}

void ReplayStream_Op(u32 op, u32 size, const u8 *operands)
{
    u8 *at = Reserve(REPLAY_INSTRUCTION_HEADER_SIZE + size);

    at[0] = op;
    at[1] = size;
    if (size != 0)
        memcpy(at + REPLAY_INSTRUCTION_HEADER_SIZE, operands, size);
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, sStreamLength - REPLAY_STREAM_TABLES_END);
}

void ReplayStream_End(u32 outcome)
{
    const u8 operands[REPLAY_OP_END_SIZE] = { outcome };
    ReplayStream_Op(REPLAY_OP_END, REPLAY_OP_END_SIZE, operands);
}

void ReplayStream_Turn(u32 number)
{
    const u8 operands[REPLAY_OP_TURN_SIZE] = { number, number >> 8 };
    ReplayStream_Op(REPLAY_OP_TURN, REPLAY_OP_TURN_SIZE, operands);
}

void ReplayStream_Print(const u8 *text)
{
    u32 size = StringLength(text) + 1;

    if (size > REPLAY_PRINT_MAX_SIZE)
        Test_ExitWithResult(TEST_RESULT_INVALID, SourceLine(0), "%s:%d: a PRINT text is longer than %d bytes", gTestRunnerState.test->filename, SourceLine(0), REPLAY_PRINT_MAX_SIZE);
    ReplayStream_Op(REPLAY_OP_PRINT, size, text);
}

void ReplayStream_Intro(void)
{
    ReplayStream_Op(REPLAY_OP_INTRO, REPLAY_OP_INTRO_SIZE, NULL);
}

void ReplayStream_SendOut(u32 side, u32 slot, u32 hp, u32 status)
{
    const u8 operands[REPLAY_OP_SEND_OUT_SIZE] = { side, slot, hp, hp >> 8, status };
    ReplayStream_Op(REPLAY_OP_SEND_OUT, REPLAY_OP_SEND_OUT_SIZE, operands);
}

void ReplayStream_Move(u32 userSide, u32 targetSide, u32 move)
{
    const u8 operands[REPLAY_OP_MOVE_SIZE] = { userSide, targetSide, move, move >> 8 };
    ReplayStream_Op(REPLAY_OP_MOVE, REPLAY_OP_MOVE_SIZE, operands);
}

void ReplayStream_Hit(u32 side, u32 effectiveness)
{
    const u8 operands[REPLAY_OP_HIT_SIZE] = { side, effectiveness };
    ReplayStream_Op(REPLAY_OP_HIT, REPLAY_OP_HIT_SIZE, operands);
}

void ReplayStream_Hp(u32 side, u32 hp)
{
    const u8 operands[REPLAY_OP_HP_SIZE] = { side, hp, hp >> 8 };
    ReplayStream_Op(REPLAY_OP_HP, REPLAY_OP_HP_SIZE, operands);
}

void ReplayStream_Faint(u32 side)
{
    const u8 operands[REPLAY_OP_FAINT_SIZE] = { side };
    ReplayStream_Op(REPLAY_OP_FAINT, REPLAY_OP_FAINT_SIZE, operands);
}

void ReplayStream_Withdraw(u32 side)
{
    const u8 operands[REPLAY_OP_WITHDRAW_SIZE] = { side };
    ReplayStream_Op(REPLAY_OP_WITHDRAW, REPLAY_OP_WITHDRAW_SIZE, operands);
}

void ReplayStream_SwitchIn(u32 side, u32 slot, u32 hp, u32 status)
{
    const u8 operands[REPLAY_OP_SWITCH_IN_SIZE] = { side, slot, hp, hp >> 8, status };
    ReplayStream_Op(REPLAY_OP_SWITCH_IN, REPLAY_OP_SWITCH_IN_SIZE, operands);
}

void ReplayStream_Status(u32 side, u32 slot, u32 status)
{
    const u8 operands[REPLAY_OP_STATUS_SIZE] = { side, slot, status };
    ReplayStream_Op(REPLAY_OP_STATUS, REPLAY_OP_STATUS_SIZE, operands);
}

void ReplayStream_Stat(u32 side, u32 stat, s32 stages, u32 arrows)
{
    const u8 operands[REPLAY_OP_STAT_SIZE] = { side, stat, (u8)stages, arrows };
    ReplayStream_Op(REPLAY_OP_STAT, REPLAY_OP_STAT_SIZE, operands);
}

void ReplayStream_Anim(u32 side, u32 anim)
{
    const u8 operands[REPLAY_OP_ANIM_SIZE] = { side, anim };
    ReplayStream_Op(REPLAY_OP_ANIM, REPLAY_OP_ANIM_SIZE, operands);
}

void ReplayStream_Weather(u32 weather)
{
    const u8 operands[REPLAY_OP_WEATHER_SIZE] = { weather };
    ReplayStream_Op(REPLAY_OP_WEATHER, REPLAY_OP_WEATHER_SIZE, operands);
}

void ReplayStream_Volatile(u32 side, u32 volatileId, bool32 on)
{
    const u8 operands[REPLAY_OP_VOLATILE_SIZE] = { side, volatileId, on };
    ReplayStream_Op(REPLAY_OP_VOLATILE, REPLAY_OP_VOLATILE_SIZE, operands);
}

void ReplayStream_Ability(u32 side, u32 ability, bool32 show)
{
    const u8 operands[REPLAY_OP_ABILITY_SIZE] = { side, ability, ability >> 8, show };
    ReplayStream_Op(REPLAY_OP_ABILITY, REPLAY_OP_ABILITY_SIZE, operands);
}

void ReplayStream_Item(u32 side, u32 slot, u32 item)
{
    const u8 operands[REPLAY_OP_ITEM_SIZE] = { side, slot, item, item >> 8 };
    ReplayStream_Op(REPLAY_OP_ITEM, REPLAY_OP_ITEM_SIZE, operands);
}

const u8 *ReplayStream_Data(void)
{
    return sStream;
}

u32 ReplayStream_Length(void)
{
    return sStreamLength;
}
