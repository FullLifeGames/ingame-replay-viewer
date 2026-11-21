#include "global.h"
#include "battle.h"
#include "pokemon.h"
#include "sprite.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/species.h"

// Switches (#6): WITHDRAW returns the mon to its ball, SWITCH_IN puts a party mon on the field
// with the stream's HP and status and clears what the engine clears when a mon enters.

// Skarmory near with Starmie, Gengar and Blissey behind it, Wobbuffet and Snorlax far, Skarmory
// and Wobbuffet on the field.
static void StartSkarmoryVsWobbuffet(void)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_SKARMORY, 100);
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_STARMIE, 100);
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 2, SPECIES_GENGAR, 100);
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 3, SPECIES_BLISSEY, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_SNORLAX, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

REPLAY_TEST("Skarmory withdraws and Blissey switches in from slot 3 with 64 HP and reset stages")
{
    u32 nearBattler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        StartSkarmoryVsWobbuffet();
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_DEF, 2, REPLAY_ARROWS_NONE);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 3, 64, REPLAY_STATUS_PAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gBattlerPartyIndexes[nearBattler], 3);
        EXPECT_EQ(nearMon->species, SPECIES_BLISSEY);
        EXPECT_EQ(nearMon->hp, 64);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][3], MON_DATA_HP), 64);
        EXPECT_EQ(nearMon->status1, STATUS1_PARALYSIS);
        EXPECT_EQ(nearMon->statStages[STAT_DEF], DEFAULT_STAT_STAGE);
        EXPECT(gSprites[gBattlerSpriteIds[nearBattler]].inUse);
        EXPECT(!gSprites[gHealthboxSpriteIds[nearBattler]].invisible);
    }
}

REPLAY_TEST("A mon switches in after a faint without a withdraw and is back on the field")
{
    u32 farBattler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartSkarmoryVsWobbuffet();
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_FAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        HP_BAR(farMon, hp: 0);
    }
    THEN
    {
        EXPECT_EQ(gBattlerPartyIndexes[farBattler], 1);
        EXPECT_EQ(farMon->species, SPECIES_SNORLAX);
        EXPECT_EQ(farMon->hp, 100);
        EXPECT(!gBattleStruct->battlerState[farBattler].notOnField);
        EXPECT(gSprites[gBattlerSpriteIds[farBattler]].inUse);
        EXPECT(!gSprites[gHealthboxSpriteIds[farBattler]].invisible);
    }
}

// The engine keeps the stages across a Baton Pass (Cmd_switchindataupdate) and Showdown logs no
// boosts for the mon that comes in.
REPLAY_TEST("After Baton Pass the mon that comes in keeps the stages")
{
    STREAM
    {
        StartSkarmoryVsWobbuffet();
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_SPE, 2, REPLAY_ARROWS_NONE);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_NEAR, MOVE_BATON_PASS);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(nearMon->species, SPECIES_STARMIE);
        EXPECT_EQ(nearMon->statStages[STAT_SPEED], DEFAULT_STAT_STAGE + 2);
    }
}

// The engine clears gCurrentMove after each action (HandleAction_ActionFinished), so a Baton Pass
// speaks for the one switch it causes and not for a later one.
REPLAY_TEST("A switch on the turn after a Baton Pass resets the stages")
{
    STREAM
    {
        StartSkarmoryVsWobbuffet();
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_SPE, 2, REPLAY_ARROWS_NONE);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_NEAR, MOVE_BATON_PASS);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_Turn(2);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 2, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(nearMon->species, SPECIES_GENGAR);
        EXPECT_EQ(nearMon->statStages[STAT_SPEED], DEFAULT_STAT_STAGE);
    }
}

REPLAY_TEST("The other side's switch right after a Baton Pass resets its stages")
{
    STREAM
    {
        StartSkarmoryVsWobbuffet();
        ReplayStream_Stat(REPLAY_SIDE_FAR, REPLAY_STAT_ATK, 2, REPLAY_ARROWS_NONE);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_NEAR, MOVE_BATON_PASS);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_Withdraw(REPLAY_SIDE_FAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_FAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(farMon->species, SPECIES_SNORLAX);
        EXPECT_EQ(farMon->statStages[STAT_ATK], DEFAULT_STAT_STAGE);
    }
}
