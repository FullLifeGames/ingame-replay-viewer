#include "global.h"
#include "test/test.h"
#include "test/replay_test.h"
#include "constants/characters.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/trainers.h"

// The interpreter refuses a stream it cannot play before any battle starts (#6, AGENTS.md: the
// ROM interpreter refuses a version it does not know).

static enum ReplayError Validate(void)
{
    return Replay_Validate(ReplayStream_Data(), ReplayStream_Length());
}

TEST("Replay: a stream of version 2 is refused before a battle starts")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(REPLAY_STREAM_OFFSET_VERSION, 2);
    EXPECT_EQ(Replay_Start(ReplayStream_Data(), ReplayStream_Length(), REPLAY_EXIT_AT_END, CB2_TestRunner), REPLAY_ERROR_VERSION);
    EXPECT_EQ(gReplayProgress.error, REPLAY_ERROR_VERSION);
    EXPECT(gMain.callback2 == CB2_TestRunner);
    EXPECT(!Replay_IsLoaded());
}

TEST("Replay: a stream of no bytes is refused as empty")
{
    ReplayStream_Begin();
    EXPECT_EQ(Replay_Validate(ReplayStream_Data(), 0), REPLAY_ERROR_EMPTY);
}

TEST("Replay: a header size of 15 is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(REPLAY_STREAM_OFFSET_HEADER_SIZE, 15);
    EXPECT_EQ(Validate(), REPLAY_ERROR_HEADER);
}

TEST("Replay: instructions that lie outside the stream are refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, REPLAY_INSTRUCTION_HEADER_SIZE + REPLAY_OP_END_SIZE + 1);
    EXPECT_EQ(Validate(), REPLAY_ERROR_HEADER);
}

TEST("Replay: op 0x7F is refused")
{
    ReplayStream_Begin();
    ReplayStream_Op(0x7F, 0, NULL);
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    EXPECT_EQ(Validate(), REPLAY_ERROR_OP);
}

TEST("Replay: TURN with size 3 is refused")
{
    const u8 operands[3] = { 1, 0, 0 };

    ReplayStream_Begin();
    ReplayStream_Op(REPLAY_OP_TURN, 3, operands);
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    EXPECT_EQ(Validate(), REPLAY_ERROR_SIZE);
}

TEST("Replay: an op that runs past the instructions is refused")
{
    ReplayStream_Begin();
    ReplayStream_Turn(1);
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, ReplayStream_Length() - REPLAY_STREAM_TABLES_END - 1);
    EXPECT_EQ(Validate(), REPLAY_ERROR_OVERRUN);
}

TEST("Replay: a stream without END is refused")
{
    ReplayStream_Begin();
    ReplayStream_Turn(1);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NO_END);
}

TEST("Replay: an op after END is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_Turn(1);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NO_END);
}

TEST("Replay: a stream of TURN and END passes")
{
    ReplayStream_Begin();
    ReplayStream_Turn(1);
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

// The team tables: every filled slot holds a mon the game can make, every name ends with EOS, and
// each side has a mon.

static enum ReplayError ValidateFarMon(u32 offset, u32 value)
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + offset, value);
    return Validate();
}

TEST("Replay: a species past the expansion's own is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 0) + REPLAY_MON_OFFSET_SPECIES, NUM_SPECIES);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
}

TEST("Replay: a level of 0 or above 100 is refused")
{
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_LEVEL, 0), REPLAY_ERROR_TEAM);
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_LEVEL, MAX_LEVEL + 1), REPLAY_ERROR_TEAM);
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_LEVEL, 1), REPLAY_ERROR_NONE);
}

TEST("Replay: a mon of 0 max HP is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_MAX_HP, 0);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
}

// The HP bar takes the change as an s16 and reads INSTANT_HP_BAR_DROP (0x7FFF) as "empty at once".
TEST("Replay: a max HP of REPLAY_MON_MAX_HP_LIMIT or more is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_MAX_HP, REPLAY_MON_MAX_HP_LIMIT);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
    ReplayStream_SetU16(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_MAX_HP, 0xFFFF);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
    ReplayStream_SetU16(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_MAX_HP, REPLAY_MON_MAX_HP_LIMIT - 1);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

TEST("Replay: a gender outside REPLAY_GENDER_* is refused")
{
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_NONE + 1), REPLAY_ERROR_TEAM);
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_NONE), REPLAY_ERROR_NONE);
}

TEST("Replay: a shiny flag other than 0 and 1 is refused")
{
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_SHINY, 2), REPLAY_ERROR_TEAM);
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_SHINY, TRUE), REPLAY_ERROR_NONE);
}

TEST("Replay: a nickname without EOS or with a control code is refused")
{
    u32 i;

    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    for (i = 0; i < REPLAY_MON_NICKNAME_LENGTH; i++)
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 0) + REPLAY_MON_OFFSET_NICKNAME + i, CHAR_A);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
    EXPECT_EQ(ValidateFarMon(REPLAY_MON_OFFSET_NICKNAME, CHAR_NEWLINE), REPLAY_ERROR_TEAM);
}

TEST("Replay: a trainer name without EOS is refused")
{
    u32 i;

    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    for (i = 0; i < REPLAY_TRAINER_NAME_LENGTH; i++)
        ReplayStream_SetU8(ReplayStream_TrainerOffset(REPLAY_SIDE_FAR) + REPLAY_TRAINER_OFFSET_NAME + i, CHAR_A);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
}

TEST("Replay: a side without a mon is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_SPECIES, SPECIES_NONE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
}

// gTrainerPicInfo has TRAINER_PIC_COUNT entries (data.h); a pic past them reads past the table.
TEST("Replay: a trainer pic at or above TRAINER_PIC_COUNT is refused")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_FAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, TRAINER_PIC_COUNT);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_FAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, 0xFFFF);
    EXPECT_EQ(Validate(), REPLAY_ERROR_TEAM);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_NEAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, TRAINER_PIC_COUNT - 1);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_FAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, TRAINER_PIC_COUNT - 1);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}
