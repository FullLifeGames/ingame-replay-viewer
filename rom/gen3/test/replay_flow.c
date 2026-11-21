#include "global.h"
#include "battle.h"
#include "pokemon.h"
#include "test/replay_test.h"
#include "constants/battle.h"

// The run of a stream through a battle: BeginBattleIntro hands the main loop to the interpreter
// (patch 0001), the ops run one after another, and END leaves the battle back to the runner.

REPLAY_TEST("END alone ends the battle as a win of the near side")
{
    STREAM { ReplayStream_End(REPLAY_OUTCOME_NEAR_WON); }
    THEN
    {
        EXPECT_EQ(gBattleOutcome, B_OUTCOME_WON);
        EXPECT_EQ(gReplayProgress.done, 1);
        EXPECT_EQ(gReplayProgress.total, 1);
        EXPECT(gReplayProgress.finished);
        EXPECT_EQ(gReplayProgress.error, REPLAY_ERROR_NONE);
    }
}

REPLAY_TEST("END of a far win ends the battle as lost")
{
    STREAM { ReplayStream_End(REPLAY_OUTCOME_FAR_WON); }
    THEN { EXPECT_EQ(gBattleOutcome, B_OUTCOME_LOST); }
}

REPLAY_TEST("END of a tie ends the battle as a draw")
{
    STREAM { ReplayStream_End(REPLAY_OUTCOME_TIE); }
    THEN { EXPECT_EQ(gBattleOutcome, B_OUTCOME_DREW); }
}

REPLAY_TEST("TURN 300 then END")
{
    STREAM
    {
        ReplayStream_Turn(300);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gReplayProgress.turn, 300);
        EXPECT_EQ(gReplayProgress.done, 2);
    }
}

REPLAY_TEST("THEN sees the battle before END leaves it")
{
    STREAM
    {
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 71, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][0], MON_DATA_HP), 71);
        EXPECT(gBattleStruct != NULL);
        EXPECT_EQ(gReplayProgress.done, 4);
    }
}
