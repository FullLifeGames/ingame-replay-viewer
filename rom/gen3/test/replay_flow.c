#include "global.h"
#include "battle.h"
#include "battle_main.h"
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

// The screenshot tool arms its shots from the frame the interpreter takes over the battle, so a shot
// at done 0 shows the battle scene and not the boot.
TEST("Replay: the progress does not say playing before the battle starts")
{
    ReplayStream_Begin();
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    EXPECT_EQ(Replay_Load(ReplayStream_Data(), ReplayStream_Length(), REPLAY_EXIT_AT_END), REPLAY_ERROR_NONE);
    EXPECT(!gReplayProgress.playing);
    Replay_Unload();
}

REPLAY_TEST("The progress says playing once the interpreter runs the battle")
{
    STREAM { ReplayStream_End(REPLAY_OUTCOME_NEAR_WON); }
    THEN { EXPECT(gReplayProgress.playing); }
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

// A recorded battle leaves on a held B while RecordedBattle_CanStopPlayback() says so
// (BattleMainCB2). The replay counts as finished from the takeover on, so B held from the first
// frame keeps the battle on screen to END, and the runner fails a test whose battle leaves
// before it.
REPLAY_TEST("B held from the first frame keeps the battle on screen to END")
{
    STREAM
    {
        ReplayTest_HoldB();
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT(JOY_HELD(B_BUTTON));
        EXPECT(gMain.callback2 == BattleMainCB2);
        EXPECT_EQ(gReplayProgress.done, 4);
        EXPECT(gReplayProgress.finished);
    }
}
