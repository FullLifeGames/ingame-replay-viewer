#include "global.h"
#include "battle.h"
#include "pokemon.h"
#include "sprite.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/moves.h"
#include "constants/songs.h"
#include "constants/species.h"

// A move and its damage (#6): MOVE plays the user's move animation, HIT the effectiveness sound and
// the hit animation, HP moves the HP bar and sets the mon's HP, FAINT plays the faint cry and the
// faint animation.

// Dugtrio near and Magneton far, both on the field.
static void StartDugtrioVsMagneton(u32 nearHp, u32 farHp)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_DUGTRIO, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_MAGNETON, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, farHp, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, nearHp, REPLAY_STATUS_NONE);
}

REPLAY_TEST("Dugtrio uses Earthquake on Magneton: move animation, super effective sound, HP bar")
{
    STREAM
    {
        StartDugtrioVsMagneton(100, 100);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_EARTHQUAKE);
        ReplayStream_Hit(REPLAY_SIDE_FAR, REPLAY_EFFECTIVENESS_SUPER);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_EARTHQUAKE, nearMon, target: farMon);
        EFFECTIVENESS_SE(farMon, SE_SUPER_EFFECTIVE);
        HP_BAR(farMon, hp: 0);
    }
    THEN
    {
        EXPECT_EQ(gBattlerAttacker, GetBattlerAtPosition(B_POSITION_PLAYER_LEFT));
        EXPECT_EQ(gBattlerTarget, GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT));
        EXPECT_EQ(gCurrentMove, MOVE_EARTHQUAKE);
    }
}

REPLAY_TEST("A normal hit plays SE_EFFECTIVE and a resisted one SE_NOT_EFFECTIVE")
{
    STREAM
    {
        StartDugtrioVsMagneton(100, 100);
        ReplayStream_Move(REPLAY_SIDE_FAR, REPLAY_SIDE_NEAR, MOVE_TACKLE);
        ReplayStream_Hit(REPLAY_SIDE_NEAR, REPLAY_EFFECTIVENESS_NORMAL);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_ROCK_SLIDE);
        ReplayStream_Hit(REPLAY_SIDE_FAR, REPLAY_EFFECTIVENESS_RESISTED);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TACKLE, farMon, target: nearMon);
        EFFECTIVENESS_SE(nearMon, SE_EFFECTIVE);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_ROCK_SLIDE, nearMon, target: farMon);
        EFFECTIVENESS_SE(farMon, SE_NOT_EFFECTIVE);
    }
}

REPLAY_TEST("Leftovers heal 71 to 77: the HP bar rises and the mon has 77 HP")
{
    STREAM
    {
        StartDugtrioVsMagneton(71, 100);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 77);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        HP_BAR(nearMon, hp: 77);
    }
    THEN
    {
        EXPECT_EQ(nearMon->hp, 77);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_HP), 77);
    }
}

REPLAY_TEST("HP keeps to the mon's max HP")
{
    STREAM
    {
        StartDugtrioVsMagneton(100, 71);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 101);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        HP_BAR(farMon, hp: 100);
    }
    THEN
    {
        EXPECT_EQ(farMon->hp, 100);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][0], MON_DATA_HP), 100);
    }
}

REPLAY_TEST("FAINT after HP 0 takes the mon off the field on both sides")
{
    u32 nearBattler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);
    u32 farBattler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartDugtrioVsMagneton(100, 100);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_NEAR);
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    SCENE
    {
        HP_BAR(farMon, hp: 0);
        HP_BAR(nearMon, hp: 0);
    }
    THEN
    {
        EXPECT_EQ(farMon->hp, 0);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][0], MON_DATA_HP), 0);
        EXPECT(!gSprites[gBattlerSpriteIds[farBattler]].inUse);
        EXPECT(gSprites[gHealthboxSpriteIds[farBattler]].invisible);
        EXPECT(gBattleStruct->battlerState[farBattler].notOnField);
        EXPECT_EQ(nearMon->hp, 0);
        EXPECT(!gSprites[gBattlerSpriteIds[nearBattler]].inUse);
        EXPECT(gSprites[gHealthboxSpriteIds[nearBattler]].invisible);
        EXPECT(gBattleStruct->battlerState[nearBattler].notOnField);
    }
}

// The KO animation (#24): when a mon faints, the expansion plays the back or front animation of the
// mon that stays (B_ANIMATE_MON_AFTER_KO, AnimateMonAfterKnockout in battle_controllers.c) while
// the faint text prints, and its faint script waits for it (waitanimation). Headless tests skip
// the animation unless FORCE_MOVE_ANIM is set.

// battlerKOAnimsRunning is a bit-field, which EXPECT_EQ cannot take.
static u32 KOAnimsRunning(void)
{
    return gBattleStruct->battlerKOAnimsRunning;
}

REPLAY_TEST("The near mon's KO animation has ended when the op after the faint text starts")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        StartDugtrioVsMagneton(100, 100);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_Print(COMPOUND_STRING("The opposing Magneton fainted!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("The opposing Magneton fainted!");
    }
    THEN
    {
        EXPECT_EQ(KOAnimsRunning(), 0);
    }
}

// Ops 0-2 are INTRO and the two SEND_OUTs; op 5 is the near HP 0 and op 6 the near FAINT.
REPLAY_TEST("The near mon faints only after its KO animation for the far mon has ended")
{
    u32 nearBattler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        StartDugtrioVsMagneton(100, 100);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_NEAR);
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    SCENE
    {
        HP_BAR(farMon, hp: 0);
        HP_BAR(nearMon, hp: 0);
    }
    THEN
    {
        EXPECT_EQ(ReplayTest_KOAnimsAtOpStart(5), 0);
        EXPECT_EQ(ReplayTest_KOAnimsAtOpStart(6), 0);
        EXPECT_EQ(KOAnimsRunning(), 0);
        EXPECT(!gSprites[gBattlerSpriteIds[nearBattler]].inUse);
        EXPECT(gSprites[gHealthboxSpriteIds[nearBattler]].invisible);
        EXPECT(gBattleStruct->battlerState[nearBattler].notOnField);
    }
}

// Ops 0-2 are INTRO and the two SEND_OUTs of StartDugtrioVsMagneton.
REPLAY_TEST("Only the faint text prints during the KO animation; the next PRINT waits for its end")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        StartDugtrioVsMagneton(100, 100);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_Print(COMPOUND_STRING("The opposing Magneton fainted!"));
        ReplayStream_Print(COMPOUND_STRING("May sent out Magneton!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("The opposing Magneton fainted!");
        MESSAGE("May sent out Magneton!");
    }
    THEN
    {
        EXPECT_NE(ReplayTest_KOAnimsAtOpStart(5), 0);
        EXPECT_EQ(ReplayTest_KOAnimsAtOpStart(6), 0);
    }
}

// An Explosion double KO (994086, 994176): the log shows no HP line for the user before its faint.
// Ops 0-2 are INTRO and the two SEND_OUTs; op 8 is END.
REPLAY_TEST("A mon that faints with HP left has 0 HP, and the far faint starts no KO animation for it")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        StartDugtrioVsMagneton(10, 100);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_NEAR);
        ReplayStream_Print(COMPOUND_STRING("Dugtrio fainted!"));
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_Print(COMPOUND_STRING("The opposing Magneton fainted!"));
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    SCENE
    {
        MESSAGE("Dugtrio fainted!");
        MESSAGE("The opposing Magneton fainted!");
    }
    THEN
    {
        EXPECT_EQ(nearMon->hp, 0);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_HP), 0);
        EXPECT_EQ(ReplayTest_KOAnimsAtOpStart(8), 0);
    }
}
