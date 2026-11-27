#include "global.h"
#include "battle.h"
#include "battle_gimmick.h"
#include "battle_interface.h"
#include "battle_terastal.h"
#include "palette.h"
#include "pokemon.h"
#include "sprite.h"
#include "test/replay_test.h"
#include "constants/battle_anim.h"
#include "constants/pokemon.h"
#include "constants/rgb.h"
#include "constants/species.h"

// Terastallization (#89): TERA plays what BattleScript_Terastallization plays between its two
// lines, which come as PRINT: B_ANIM_TERA_CHARGE, then the tint and the type's indicator in the
// healthbox (ApplyBattlerVisualsForTeraAnim), then B_ANIM_TERA_ACTIVATE. The state is the party
// mon's Tera type and the gimmick of its party slot, which a sprite load and a healthbox update
// read, so it stays with the mon when it leaves the field and comes back. Headless tests skip the
// animations (LaunchBattleAnimation), so they read the unfaded palette.

// Wobbuffet near and far on the field, a second Wobbuffet behind the near one. StartBattle writes
// ops 0 to 2, so the op after it is op 3.
#define TERA_OP 3

static void StartBattle(void)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

// The color BlendPalette makes of color, coeff sixteenths of the way to blendColor.
static u16 BlendColor(u16 color, u32 coeff, u16 blendColor)
{
    s32 r = GET_R(color), g = GET_G(color), b = GET_B(color);

    return RGB(r + (((GET_R(blendColor) - r) * (s32)coeff) >> 4),
               g + (((GET_G(blendColor) - g) * (s32)coeff) >> 4),
               b + (((GET_B(blendColor) - b) * (s32)coeff) >> 4));
}

// Whether the battler's sprite palette is its mon's own, blended coeff sixteenths of the way to
// color, as the game tints a Terastallized mon by 8 toward its type's color.
static bool32 IsPaletteBlended(u32 battler, u32 coeff, u16 color)
{
    const u16 *own = GetMonFrontSpritePal(GetBattlerMon(battler));
    u32 i;

    for (i = 0; i < 16; i++)
    {
        if (gPlttBufferUnfaded[OBJ_PLTT_ID(battler) + i] != BlendColor(own[i], coeff, color))
            return FALSE;
    }
    return TRUE;
}

static const struct Sprite *GetIndicator(u32 battler)
{
    return &gSprites[gBattleStruct->gimmick.indicatorSpriteId[battler]];
}

// The healthbox shows the Tera indicator in place of "Lv", drawn with the indicator's palette.
static bool32 ShowsTeraIndicator(u32 battler)
{
    const struct Sprite *indicator = GetIndicator(battler);

    return !indicator->invisible && indicator->oam.paletteNum == IndexOfSpritePaletteTag(TAG_TERA_INDICATOR_PAL);
}

// The game loads the indicator palettes at the first turn's events (LoadIndicatorSpritesGfx), a
// state the replay never reaches: TERA loads them itself.
REPLAY_TEST("INTRO and the send-outs load no Tera indicator palette")
{
    STREAM
    {
        StartBattle();
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN { EXPECT_EQ(IndexOfSpritePaletteTag(TAG_TERA_INDICATOR_PAL), 0xFF); }
}

REPLAY_TEST("TERA plays the Tera charge and activate animations between Tera's two lines")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_FlushTextBox();
        ReplayStream_Print(COMPOUND_STRING("Wobbuffet is storing energy!"));
        ReplayStream_Tera(REPLAY_SIDE_NEAR, TYPE_FAIRY);
        ReplayStream_Print(COMPOUND_STRING("Wobbuffet terastallized into the Fairy type!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("Wobbuffet is storing energy!");
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_CHARGE, nearMon);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_ACTIVATE, nearMon);
        MESSAGE("Wobbuffet terastallized into the Fairy type!");
    }
    THEN
    {
        EXPECT_EQ(GetActiveGimmick(battler), GIMMICK_TERA);
        EXPECT_EQ(GetMonData(GetBattlerMon(battler), MON_DATA_TERA_TYPE), TYPE_FAIRY);
        EXPECT_NE(IndexOfSpritePaletteTag(TAG_TERA_INDICATOR_PAL), 0xFF);
        EXPECT(ShowsTeraIndicator(battler));
        EXPECT(IsPaletteBlended(battler, 8, GetTeraTypeRGB(TYPE_FAIRY)));
    }
}

REPLAY_TEST("A far mon Terastallizes into Stellar")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_Tera(REPLAY_SIDE_FAR, TYPE_STELLAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_CHARGE, farMon);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_ACTIVATE, farMon);
    }
    THEN
    {
        EXPECT_EQ(GetActiveGimmick(battler), GIMMICK_TERA);
        EXPECT_EQ(GetMonData(GetBattlerMon(battler), MON_DATA_TERA_TYPE), TYPE_STELLAR);
        EXPECT(ShowsTeraIndicator(battler));
        EXPECT(IsPaletteBlended(battler, 8, GetTeraTypeRGB(TYPE_STELLAR)));
    }
}

REPLAY_TEST("A Terastallized mon switched out and back keeps its tint and its indicator")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_Tera(REPLAY_SIDE_NEAR, TYPE_FAIRY);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(GetActiveGimmick(battler), GIMMICK_TERA);
        EXPECT(ShowsTeraIndicator(battler));
        EXPECT(IsPaletteBlended(battler, 8, GetTeraTypeRGB(TYPE_FAIRY)));
    }
}

// The gimmick stays with the party slot that left (slot 0), so the slot that comes in has none.
REPLAY_TEST("The mon that comes in for a Terastallized mon has neither its tint nor its indicator")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_Tera(REPLAY_SIDE_NEAR, TYPE_FAIRY);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_ACTIVATE, nearMon); }
    THEN
    {
        EXPECT_EQ(gBattleStruct->gimmick.activeGimmick[B_TRAINER_PLAYER][0], GIMMICK_TERA);
        EXPECT_EQ(GetActiveGimmick(battler), GIMMICK_NONE);
        EXPECT(GetIndicator(battler)->invisible);
        EXPECT(IsPaletteBlended(battler, 0, RGB_BLACK));
    }
}

// The indicator shows when the FAINT starts, two ops after the TERA, and the faint hides it.
REPLAY_TEST("A Terastallized mon that faints hides its indicator")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        StartBattle();
        ReplayStream_Tera(REPLAY_SIDE_FAR, TYPE_FAIRY);
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_ACTIVATE, farMon); }
    THEN
    {
        EXPECT(ReplayTest_IndicatorShownAtOpStart(TERA_OP + 2, REPLAY_SIDE_FAR));
        EXPECT(gSprites[gHealthboxSpriteIds[battler]].invisible);
        EXPECT(GetIndicator(battler)->invisible);
    }
}

REPLAY_TEST("The outro returns a Terastallized mon and hides its indicator")
{
    u32 battler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Tera(REPLAY_SIDE_FAR, TYPE_FAIRY);
        ReplayStream_End(REPLAY_OUTCOME_FAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_TERA_ACTIVATE, farMon);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
    }
    THEN
    {
        EXPECT(gSprites[gHealthboxSpriteIds[battler]].invisible);
        EXPECT(GetIndicator(battler)->invisible);
    }
}
