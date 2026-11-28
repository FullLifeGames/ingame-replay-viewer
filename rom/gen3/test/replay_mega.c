#include "global.h"
#include "battle.h"
#include "battle_gimmick.h"
#include "battle_interface.h"
#include "pokemon.h"
#include "sprite.h"
#include "test/replay_test.h"
#include "constants/battle_anim.h"
#include "constants/species.h"

// Mega Evolution (#126): MEGA_EVOLVE plays what BattleScript_MegaEvolution plays between its two
// lines, which come as PRINT: the species change, B_ANIM_MEGA_EVOLUTION, then the healthbox
// redrawn for the new species. The state is the party mon's species and the gimmick of its party
// slot, which a healthbox update reads to show the Mega mark in place of "Lv". Headless tests skip
// the animation (LaunchBattleAnimation), so they read the state and the sprites in THEN.

// Venusaur far and Wobbuffet near on the field, a second far mon behind Venusaur. StartBattle
// writes ops 0 to 2, so the op after it is op 3.
#define MEGA_OP 3

static void StartBattle(void)
{
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_VENUSAUR, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

static const struct Sprite *GetIndicator(u32 battler)
{
    return &gSprites[gBattleStruct->gimmick.indicatorSpriteId[battler]];
}

// The healthbox shows the Mega mark in place of "Lv", drawn with the mark's palette.
static bool32 ShowsMegaIndicator(u32 battler)
{
    const struct Sprite *indicator = GetIndicator(battler);

    return !indicator->invisible && indicator->oam.paletteNum == IndexOfSpritePaletteTag(TAG_MEGA_INDICATOR_PAL);
}

REPLAY_TEST("MEGA_EVOLVE plays the Mega Evolution animation between the two lines")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_FlushTextBox();
        ReplayStream_Print(COMPOUND_STRING("Venusaurite is reacting!"));
        ReplayStream_MegaEvolve(REPLAY_SIDE_FAR, SPECIES_VENUSAUR_MEGA);
        ReplayStream_Print(COMPOUND_STRING("Venusaur has Mega Evolved!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("Venusaurite is reacting!");
        NOT ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_FORM_CHANGE, farMon);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_MEGA_EVOLUTION, farMon);
        NOT ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_FORM_CHANGE, farMon);
        MESSAGE("Venusaur has Mega Evolved!");
    }
    THEN
    {
        EXPECT_EQ(farMon->species, SPECIES_VENUSAUR_MEGA);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][0], MON_DATA_SPECIES), SPECIES_VENUSAUR_MEGA);
        EXPECT_EQ(gBattleSpritesDataPtr->battlerData[battler].transformSpecies, SPECIES_VENUSAUR_MEGA);
    }
}

REPLAY_TEST("MEGA_EVOLVE sets Mega Evolution as the gimmick of the mon's party slot")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_MegaEvolve(REPLAY_SIDE_FAR, SPECIES_VENUSAUR_MEGA);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_MEGA_EVOLUTION, farMon); }
    THEN
    {
        EXPECT_EQ(GetActiveGimmick(battler), GIMMICK_MEGA);
        EXPECT_EQ(gBattleStruct->gimmick.activeGimmick[B_TRAINER_OPPONENT_A][0], GIMMICK_MEGA);
        EXPECT_EQ(gBattleStruct->gimmick.activeGimmick[B_TRAINER_OPPONENT_A][1], GIMMICK_NONE);
    }
}

REPLAY_TEST("The far healthbox shows the Mega mark in place of Lv")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_MegaEvolve(REPLAY_SIDE_FAR, SPECIES_VENUSAUR_MEGA);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_MEGA_EVOLUTION, farMon); }
    THEN
    {
        EXPECT_NE(IndexOfSpritePaletteTag(TAG_MEGA_INDICATOR_PAL), 0xFF);
        EXPECT(ShowsMegaIndicator(battler));
    }
}

REPLAY_TEST("The near healthbox shows the Mega mark in place of Lv")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_VENUSAUR, 100);
        StartBattle();
        ReplayStream_MegaEvolve(REPLAY_SIDE_NEAR, SPECIES_VENUSAUR_MEGA);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_MEGA_EVOLUTION, nearMon); }
    THEN
    {
        EXPECT_EQ(nearMon->species, SPECIES_VENUSAUR_MEGA);
        EXPECT_EQ(GetActiveGimmick(battler), GIMMICK_MEGA);
        EXPECT(ShowsMegaIndicator(battler));
    }
}

// The mark shows when the FAINT starts, two ops after the MEGA_EVOLVE, and the faint hides it.
REPLAY_TEST("A Mega that faints hides its mark")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_MegaEvolve(REPLAY_SIDE_FAR, SPECIES_VENUSAUR_MEGA);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_MEGA_EVOLUTION, farMon); }
    THEN
    {
        EXPECT(ReplayTest_IndicatorShownAtOpStart(MEGA_OP + 2, REPLAY_SIDE_FAR));
        EXPECT(gSprites[gHealthboxSpriteIds[battler]].invisible);
        EXPECT(GetIndicator(battler)->invisible);
    }
}

REPLAY_TEST("The outro returns a Mega and hides its mark")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_MegaEvolve(REPLAY_SIDE_FAR, SPECIES_VENUSAUR_MEGA);
        ReplayStream_End(REPLAY_OUTCOME_FAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_MEGA_EVOLUTION, farMon);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
    }
    THEN
    {
        EXPECT(gSprites[gHealthboxSpriteIds[battler]].invisible);
        EXPECT(GetIndicator(battler)->invisible);
    }
}
