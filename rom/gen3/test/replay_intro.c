#include "global.h"
#include "battle.h"
#include "pokemon.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/characters.h"
#include "constants/species.h"

// The start of a battle (#6): INTRO runs the game's own intro up to its first text, PRINT shows
// the backend's finished text, and SEND_OUT throws each side's first mon. After INTRO both sides
// send out, as in every stream of the backend: the ball throw hides a side's party summary, and a
// summary still shown at the end is a task the test runner reports as not freed.

REPLAY_TEST("INTRO, PRINT and SEND_OUT play the start of a battle in order")
{
    STREAM
    {
        ReplayStream_Intro();
        ReplayStream_Print(COMPOUND_STRING("Alice would like to battle!"));
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_Print(COMPOUND_STRING("Go! Dugtrio!"));
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("Alice would like to battle!");
        MESSAGE("Go! Dugtrio!");
    }
    THEN
    {
        EXPECT_EQ(gReplayProgress.done, 6);
        EXPECT_EQ(nearMon->species, SPECIES_WOBBUFFET);
        EXPECT_EQ(farMon->species, SPECIES_WOBBUFFET);
    }
}

static u32 CountChars(const u8 *text, u32 c)
{
    u32 count = 0;

    for (; *text != EOS; text++)
    {
        if (*text == c)
            count++;
    }
    return count;
}

REPLAY_TEST("A PRINT of three lines is recorded whole and broken for the text box")
{
    STREAM
    {
        ReplayStream_Print(COMPOUND_STRING("The opposing Wobbuffet's Shadow Tag keeps every foe in the battle until it faints at last!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("The opposing Wobbuffet's Shadow Tag keeps every foe in the battle until it faints at last!");
    }
    THEN
    {
        EXPECT_EQ(CountChars(gDisplayedStringBattle, CHAR_NEWLINE), 1);
        EXPECT_EQ(CountChars(gDisplayedStringBattle, CHAR_PROMPT_SCROLL), 1);
    }
}

REPLAY_TEST("SEND_OUT of party slot 2 with 71 HP sends that mon out")
{
    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 2, SPECIES_DUGTRIO, 100);
        ReplayStream_Mon(REPLAY_SIDE_FAR, 2, SPECIES_MAGNETON, 100);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 2, 71, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 2, 71, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gBattlerPartyIndexes[GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT)], 2);
        EXPECT_EQ(farMon->species, SPECIES_MAGNETON);
        EXPECT_EQ(farMon->hp, 71);
        EXPECT_EQ(gBattlerPartyIndexes[GetBattlerAtPosition(B_POSITION_PLAYER_LEFT)], 2);
        EXPECT_EQ(nearMon->species, SPECIES_DUGTRIO);
        EXPECT_EQ(nearMon->hp, 71);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][2], MON_DATA_HP), 71);
    }
}

REPLAY_TEST("SEND_OUT with a status gives the mon that status")
{
    STREAM
    {
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_SLP);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_PAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(nearMon->status1, STATUS1_PARALYSIS);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_STATUS), STATUS1_PARALYSIS);
        EXPECT_EQ(farMon->status1, STATUS1_SLEEP_TURN(3));
    }
}

REPLAY_TEST("SEND_OUT keeps HP at the mon's max HP")
{
    STREAM
    {
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 101, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN { EXPECT_EQ(nearMon->hp, 100); }
}
