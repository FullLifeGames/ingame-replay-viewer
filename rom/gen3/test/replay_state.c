#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "pokemon.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/species.h"

// A mon's state (#6): STATUS sets the party's status and the icon of a mon on the field, STAT
// changes the stages and plays the stat arrows, ANIM plays a general or a status animation, ITEM
// sets the held item.

// Gyarados near and Skarmory far on the field, Blissey behind Skarmory.
static void StartGyaradosVsSkarmory(void)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_GYARADOS, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_SKARMORY, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_BLISSEY, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

static u32 LastBattleAnimArg(void)
{
    return gBattleSpritesDataPtr->animationData->animArg;
}

REPLAY_TEST("Toxic: the poison animation, then the bad poison icon")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_TOXIC);
        ReplayStream_Anim(REPLAY_SIDE_FAR, REPLAY_ANIM_STATUS_PSN);
        ReplayStream_Status(REPLAY_SIDE_FAR, 0, REPLAY_STATUS_TOX);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TOXIC, nearMon, target: farMon);
        ANIMATION(ANIM_TYPE_STATUS, B_ANIM_STATUS_PSN, farMon);
        STATUS_ICON(farMon, badPoison: TRUE);
    }
    THEN
    {
        EXPECT_EQ(farMon->status1, STATUS1_TOXIC_POISON);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][0], MON_DATA_STATUS), STATUS1_TOXIC_POISON);
    }
}

REPLAY_TEST("Status on a benched mon sets its party status and shows no icon")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Status(REPLAY_SIDE_FAR, 1, REPLAY_STATUS_PAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        NONE_OF
        {
            STATUS_ICON(farMon, none: TRUE);
            STATUS_ICON(farMon, paralysis: TRUE);
        }
    }
    THEN
    {
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][1], MON_DATA_STATUS), STATUS1_PARALYSIS);
        EXPECT_EQ(farMon->status1, 0);
    }
}

REPLAY_TEST("Dragon Dance: one stat arrow animation for two stages up")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_ATK, 1, REPLAY_ARROWS_SEVERAL);
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_SPE, 1, REPLAY_ARROWS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_STATS_CHANGE, nearMon);
        NOT ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_STATS_CHANGE);
    }
    THEN
    {
        EXPECT_EQ(nearMon->statStages[STAT_ATK], DEFAULT_STAT_STAGE + 1);
        EXPECT_EQ(nearMon->statStages[STAT_SPEED], DEFAULT_STAT_STAGE + 1);
        EXPECT_EQ(LastBattleAnimArg(), STAT_ANIM_MULTIPLE_PLUS1);
    }
}

REPLAY_TEST("Intimidate: Attack falls one stage with the arrows of one stat")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Stat(REPLAY_SIDE_FAR, REPLAY_STAT_ATK, -1, REPLAY_ARROWS_ONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_STATS_CHANGE, farMon);
    }
    THEN
    {
        EXPECT_EQ(farMon->statStages[STAT_ATK], DEFAULT_STAT_STAGE - 1);
        EXPECT_EQ(LastBattleAnimArg(), STAT_ATK + STAT_ANIM_MINUS1);
    }
}

REPLAY_TEST("Stages of two or more pick the sharp arrows and keep to 0 to 12")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Stat(REPLAY_SIDE_FAR, REPLAY_STAT_EVASION, -12, REPLAY_ARROWS_NONE);
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_SPE, 12, REPLAY_ARROWS_NONE);
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_DEF, 2, REPLAY_ARROWS_ONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_STATS_CHANGE, nearMon);
    }
    THEN
    {
        EXPECT_EQ(farMon->statStages[STAT_EVASION], MIN_STAT_STAGE);
        EXPECT_EQ(nearMon->statStages[STAT_SPEED], MAX_STAT_STAGE);
        EXPECT_EQ(nearMon->statStages[STAT_DEF], DEFAULT_STAT_STAGE + 2);
        EXPECT_EQ(LastBattleAnimArg(), STAT_DEF + STAT_ANIM_PLUS2);
    }
}

// The engine prints "won't go any higher" and plays no arrows for a stat that cannot change.
REPLAY_TEST("A STAT of 0 stages plays no arrows")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Stat(REPLAY_SIDE_NEAR, REPLAY_STAT_ATK, 0, REPLAY_ARROWS_ONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        NOT ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_STATS_CHANGE);
    }
    THEN
    {
        EXPECT_EQ(nearMon->statStages[STAT_ATK], DEFAULT_STAT_STAGE);
    }
}

REPLAY_TEST("ANIM HELD_ITEM_EFFECT plays the held item animation")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_HELD_ITEM_EFFECT);
        ReplayStream_Anim(REPLAY_SIDE_FAR, REPLAY_ANIM_SANDSTORM_CONTINUES);
        ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_STATUS_SLP);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_HELD_ITEM_EFFECT, nearMon);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SANDSTORM_CONTINUES, farMon);
        ANIMATION(ANIM_TYPE_STATUS, B_ANIM_STATUS_SLP, nearMon);
    }
}

REPLAY_TEST("ITEM sets the held item of the party mon and of the mon on the field")
{
    STREAM
    {
        StartGyaradosVsSkarmory();
        ReplayStream_Item(REPLAY_SIDE_NEAR, 0, ITEM_LEFTOVERS);
        ReplayStream_Item(REPLAY_SIDE_FAR, 1, ITEM_CHOICE_BAND);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(nearMon->item, ITEM_LEFTOVERS);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_HELD_ITEM), ITEM_LEFTOVERS);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][1], MON_DATA_HELD_ITEM), ITEM_CHOICE_BAND);
        EXPECT_EQ(farMon->item, ITEM_NONE);
    }
}
