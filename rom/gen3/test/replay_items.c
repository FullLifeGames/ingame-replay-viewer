#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/characters.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/species.h"

// Held items and traps (format v2, #16, #19): ITEM_POP_UP empties the text box and shows a held
// item's pop-up as BattleScript_ItemPopUp_Scripting does, ANIM SIMPLE_HEAL plays the heal of a
// Leftovers turn, TRAP_TURN plays the end-of-turn animation of the move that traps a mon.

// Gyarados near and Tyranitar far, both on the field with these HP and statuses.
static void StartGyaradosVsTyranitar(u32 nearHp, u32 nearStatus, u32 farHp)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_GYARADOS, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_TYRANITAR, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, farHp, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, nearHp, nearStatus);
}

static u32 BattlerOf(struct BattlePokemon *mon)
{
    return mon - gBattleMons;
}

// BattleScript_ItemHealHP_Ret: the pop-up, the held item animation, the heal and the bar, and no
// text.
REPLAY_TEST("Leftovers: the pop-up, the held item animation, the heal, then the HP bar")
{
    STREAM
    {
        StartGyaradosVsTyranitar(100, REPLAY_STATUS_NONE, 71);
        ReplayStream_ItemPopUp(REPLAY_SIDE_FAR, ITEM_LEFTOVERS);
        ReplayStream_Anim(REPLAY_SIDE_FAR, REPLAY_ANIM_HELD_ITEM_EFFECT);
        ReplayStream_Anim(REPLAY_SIDE_FAR, REPLAY_ANIM_SIMPLE_HEAL);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 77);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ITEM_POPUP(farMon, ITEM_LEFTOVERS);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_HELD_ITEM_EFFECT, farMon);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SIMPLE_HEAL, farMon);
        HP_BAR(farMon, hp: 77);
    }
    THEN
    {
        EXPECT_EQ(gLastUsedItem, ITEM_LEFTOVERS);
        EXPECT(!gBattleStruct->battlerState[BattlerOf(farMon)].activeAbilityPopUps);
    }
}

// flushtextbox prints STRINGID_EMPTYSTRING3 before showitempopup.
REPLAY_TEST("ITEM_POP_UP empties the text box before the pop-up")
{
    STREAM
    {
        StartGyaradosVsTyranitar(100, REPLAY_STATUS_NONE, 100);
        ReplayStream_Print(COMPOUND_STRING("Gyarados used Splash!"));
        ReplayStream_ItemPopUp(REPLAY_SIDE_NEAR, ITEM_LEFTOVERS);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("Gyarados used Splash!");
        ITEM_POPUP(nearMon, ITEM_LEFTOVERS);
    }
    THEN
    {
        EXPECT_EQ(gDisplayedStringBattle[0], EOS);
    }
}

// BattleScript_BerryCureStatusRet: the pop-up, the berry animation, then the cure line.
REPLAY_TEST("Lum Berry: the pop-up, the berry animation, then the cure line")
{
    STREAM
    {
        StartGyaradosVsTyranitar(100, REPLAY_STATUS_PAR, 100);
        ReplayStream_ItemPopUp(REPLAY_SIDE_NEAR, ITEM_LUM_BERRY);
        ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_HELD_ITEM_BERRY);
        ReplayStream_Item(REPLAY_SIDE_NEAR, 0, ITEM_NONE);
        ReplayStream_Status(REPLAY_SIDE_NEAR, 0, REPLAY_STATUS_NONE);
        ReplayStream_Print(COMPOUND_STRING("Gyarados's Lum Berry cured its paralysis!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ITEM_POPUP(nearMon, ITEM_LUM_BERRY);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_HELD_ITEM_BERRY, nearMon);
        STATUS_ICON(nearMon, none: TRUE);
        MESSAGE("Gyarados's Lum Berry cured its paralysis!");
    }
    THEN
    {
        EXPECT_EQ(nearMon->status1, 0);
        EXPECT(!gBattleStruct->battlerState[BattlerOf(nearMon)].activeAbilityPopUps);
    }
}

// BattleScript_WrapTurnDmg: B_ANIM_TURN_TRAP with the trapping move as its argument
// (HandleEndTurnWrap), then "is hurt by" and the bar.
REPLAY_TEST("TRAP_TURN plays Fire Spin's trap animation before the damage")
{
    STREAM
    {
        StartGyaradosVsTyranitar(100, REPLAY_STATUS_NONE, 100);
        ReplayStream_TrapTurn(REPLAY_SIDE_FAR, MOVE_FIRE_SPIN);
        ReplayStream_Print(COMPOUND_STRING("The opposing Tyranitar is hurt by Fire Spin!"));
        ReplayStream_Hp(REPLAY_SIDE_FAR, 94);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TURN_TRAP, farMon);
        MESSAGE("The opposing Tyranitar is hurt by Fire Spin!");
        HP_BAR(farMon, hp: 94);
    }
    THEN
    {
        EXPECT_EQ(gBattleSpritesDataPtr->animationData->animArg, MOVE_FIRE_SPIN);
    }
}
