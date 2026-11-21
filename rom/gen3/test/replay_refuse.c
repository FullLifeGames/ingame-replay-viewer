#include "global.h"
#include "test/test.h"
#include "test/replay_test.h"

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
