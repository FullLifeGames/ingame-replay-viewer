#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "decompress.h"
#include "malloc.h"
#include "palette.h"
#include "pokemon.h"
#include "replay_ops.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/moves.h"
#include "constants/rgb.h"
#include "constants/species.h"

// Transform's copy (#68). MOVE Transform turns its user into the target, and the copy takes the
// target's personality and shininess, as Cmd_transformdataexecution sets them before the move
// animation. The animation draws the copy from them (HandleSpeciesGfxDataChange), and so does a
// later reload of the sprite, such as the one after a substitute fades (BattleLoadMonSpriteGfx).
// Headless tests play Transform's animation (LaunchBattleAnimation plays it even then), so they
// read the drawn palette and pic after the battle.

static u32 OtherSide(u32 side)
{
    return side == REPLAY_SIDE_NEAR ? REPLAY_SIDE_FAR : REPLAY_SIDE_NEAR;
}

// Ditto on userSide and the target on the other side, both on the field.
static void StartDittoVs(u32 userSide, u32 targetSpecies, bool32 targetShiny)
{
    u32 targetSide = OtherSide(userSide);

    ReplayStream_Mon(userSide, 0, SPECIES_DITTO, 100);
    ReplayStream_Mon(targetSide, 0, targetSpecies, 100);
    ReplayStream_SetU8(ReplayStream_MonOffset(targetSide, 0) + REPLAY_MON_OFFSET_SHINY, targetShiny);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

// Transform's tint: HandleSpeciesGfxDataChange blends the copy's palette 6/16 of the way to white,
// as BlendPalette(paletteOffset, 16, 6, RGB_WHITE) computes it.
static u16 InTransformTint(u16 color)
{
    u32 r = GET_R(color), g = GET_G(color), b = GET_B(color);

    return RGB(r + (((31 - r) * 6) >> 4), g + (((31 - g) * 6) >> 4), b + (((31 - b) * 6) >> 4));
}

// The copy draws with the target's palette in Transform's tint.
static bool32 DrawsTargetColours(u32 userSide)
{
    u32 user = Replay_GetBattler(userSide);
    u32 target = Replay_GetBattler(OtherSide(userSide));
    u32 i;

    for (i = 0; i < 16; i++)
    {
        if (gPlttBufferUnfaded[OBJ_PLTT_ID(user) + i] != InTransformTint(gPlttBufferUnfaded[OBJ_PLTT_ID(target) + i]))
            return FALSE;
    }
    return TRUE;
}

// The copy's pic is the target species' front pic drawn with personality, which places Spinda's
// spots. Only a front pic has spots (LoadSpecialPokePicIsEgg), so the copy is the far mon.
static bool32 DrawsFrontPicWith(u32 battler, u32 species, u32 personality)
{
    u8 *expected = AllocZeroed(MON_PIC_SIZE * MAX_MON_PIC_FRAMES);
    bool32 same;

    HandleLoadSpecialPokePic(TRUE, expected, species, personality);
    same = memcmp(expected, gMonSpritesGfxPtr->spritesGfx[GetBattlerPosition(battler)], MON_PIC_SIZE) == 0;
    Free(expected);
    return same;
}

REPLAY_TEST("MOVE Transform by the near mon copies the far target's shiny colours")
{
    u32 user = Replay_GetBattler(REPLAY_SIDE_NEAR);

    STREAM
    {
        StartDittoVs(REPLAY_SIDE_NEAR, SPECIES_GYARADOS, TRUE);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_TRANSFORM);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_TRANSFORM, nearMon); }
    THEN
    {
        EXPECT(gTransformedShininess[user]);
        EXPECT_EQ(gBattleSpritesDataPtr->battlerData[user].transformSpecies, SPECIES_GYARADOS);
        EXPECT(DrawsTargetColours(REPLAY_SIDE_NEAR));
    }
}

REPLAY_TEST("MOVE Transform by the far mon copies the near target's shiny colours")
{
    u32 user = Replay_GetBattler(REPLAY_SIDE_FAR);

    STREAM
    {
        StartDittoVs(REPLAY_SIDE_FAR, SPECIES_GYARADOS, TRUE);
        ReplayStream_Move(REPLAY_SIDE_FAR, REPLAY_SIDE_NEAR, MOVE_TRANSFORM);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_TRANSFORM, farMon); }
    THEN
    {
        EXPECT(gTransformedShininess[user]);
        EXPECT_EQ(gBattleSpritesDataPtr->battlerData[user].transformSpecies, SPECIES_GYARADOS);
        EXPECT(DrawsTargetColours(REPLAY_SIDE_FAR));
    }
}

REPLAY_TEST("MOVE Transform copies a Spinda target's personality and its spots")
{
    u32 user = Replay_GetBattler(REPLAY_SIDE_FAR);
    u32 target = Replay_GetBattler(REPLAY_SIDE_NEAR);

    STREAM
    {
        StartDittoVs(REPLAY_SIDE_FAR, SPECIES_SPINDA, FALSE);
        ReplayStream_Move(REPLAY_SIDE_FAR, REPLAY_SIDE_NEAR, MOVE_TRANSFORM);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_TRANSFORM, farMon); }
    THEN
    {
        u32 personality = GetMonData(GetBattlerMon(target), MON_DATA_PERSONALITY);

        EXPECT_EQ(gTransformedPersonalities[user], personality);
        EXPECT(DrawsFrontPicWith(user, SPECIES_SPINDA, personality));
        EXPECT(DrawsTargetColours(REPLAY_SIDE_FAR));
    }
}

// The substitute's fade loads the mon's sprite again (AnimTask_SwapMonSpriteToFromSubstitute), so
// the copy keeps its colours only if the battle mon counts as transformed. The fade plays only
// with animations forced.
REPLAY_TEST("A Transform copy keeps the target's shiny colours after its substitute fades")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        StartDittoVs(REPLAY_SIDE_NEAR, SPECIES_GYARADOS, TRUE);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_TRANSFORM);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_NEAR, MOVE_SUBSTITUTE);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 75);
        ReplayStream_Volatile(REPLAY_SIDE_NEAR, REPLAY_VOLATILE_SUBSTITUTE, TRUE);
        ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_SUBSTITUTE_FADE);
        ReplayStream_Volatile(REPLAY_SIDE_NEAR, REPLAY_VOLATILE_SUBSTITUTE, FALSE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TRANSFORM, nearMon);
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SUBSTITUTE_FADE, nearMon);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(DrawsTargetColours(REPLAY_SIDE_NEAR));
    }
}

// The engine clears the copy when the next mon enters (SwitchInClearSetData clears the
// volatiles, the switch-in animation the transformed species), and so does SWITCH_IN.
REPLAY_TEST("SWITCH_IN after a Transform brings in a mon that is no copy")
{
    u32 user = Replay_GetBattler(REPLAY_SIDE_NEAR);

    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_SPINDA, 100);
        StartDittoVs(REPLAY_SIDE_NEAR, SPECIES_GYARADOS, TRUE);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_TRANSFORM);
        ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT(!nearMon->volatiles.transformed);
        EXPECT(!nearMon->volatiles.isTransformedMonShiny);
        EXPECT(nearMon->volatiles.transformedMonPID == 0);
        EXPECT_EQ(gBattleSpritesDataPtr->battlerData[user].transformSpecies, SPECIES_NONE);
    }
}
