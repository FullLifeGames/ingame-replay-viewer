#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "test/replay_test.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/moves.h"
#include "constants/species.h"

// The field, the ability pop-ups and the HP numbers (#6): WEATHER sets the battle's weather (snow
// since version 4, #89), VOLATILE puts a mon behind its substitute and takes it away again,
// ABILITY sets a mon's ability and shows or hides its pop-up, and a replay hides the near side's HP
// numbers.

// Skarmory near and Tyranitar far, both on the field.
static void StartSkarmoryVsTyranitar(void)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_SKARMORY, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_TYRANITAR, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

static u32 BattlerOf(struct BattlePokemon *mon)
{
    return mon - gBattleMons;
}

static bool32 IsBehindSubstitute(struct BattlePokemon *mon)
{
    return gBattleSpritesDataPtr->battlerData[BattlerOf(mon)].behindSubstitute;
}

REPLAY_TEST("Sand Stream: the pop-up, the sandstorm and its text, then the pop-up goes")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Ability(REPLAY_SIDE_FAR, ABILITY_SAND_STREAM, TRUE);
        ReplayStream_Weather(REPLAY_WEATHER_SAND);
        ReplayStream_Print(COMPOUND_STRING("A sandstorm kicked up!"));
        ReplayStream_Ability(REPLAY_SIDE_FAR, ABILITY_SAND_STREAM, FALSE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ABILITY_POPUP(farMon, ABILITY_SAND_STREAM);
        MESSAGE("A sandstorm kicked up!");
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_SANDSTORM);
        EXPECT_EQ(farMon->ability, ABILITY_SAND_STREAM);
        EXPECT(!gBattleStruct->battlerState[BattlerOf(farMon)].activeAbilityPopUps);
    }
}

REPLAY_TEST("Sandstorm upkeep: the weather stays and its animation plays")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_SAND);
        ReplayStream_Turn(2);
        ReplayStream_Print(COMPOUND_STRING("The sandstorm is raging."));
        ReplayStream_Anim(REPLAY_SIDE_FAR, REPLAY_ANIM_SANDSTORM_CONTINUES);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("The sandstorm is raging.");
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SANDSTORM_CONTINUES, farMon);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_SANDSTORM);
    }
}

REPLAY_TEST("Rain Dance sets rain")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_RAIN);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_RAIN_NORMAL);
    }
}

REPLAY_TEST("Sunny Day sets sun")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_SUN);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_SUN_NORMAL);
    }
}

REPLAY_TEST("Hail sets hail")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_HAIL);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_HAIL);
    }
}

REPLAY_TEST("Snow Warning: the pop-up, snow and its text, then its animation")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Ability(REPLAY_SIDE_FAR, ABILITY_SNOW_WARNING, TRUE);
        ReplayStream_Weather(REPLAY_WEATHER_SNOW);
        ReplayStream_Print(COMPOUND_STRING("It started to snow!"));
        ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_SNOW_CONTINUES);
        ReplayStream_Ability(REPLAY_SIDE_FAR, ABILITY_SNOW_WARNING, FALSE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ABILITY_POPUP(farMon, ABILITY_SNOW_WARNING);
        MESSAGE("It started to snow!");
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SNOW_CONTINUES, nearMon);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_SNOW);
        EXPECT(!gBattleStruct->battlerState[BattlerOf(farMon)].activeAbilityPopUps);
    }
}

REPLAY_TEST("Snow upkeep: the snow stays, its text, then its animation")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_SNOW);
        ReplayStream_Turn(2);
        ReplayStream_Print(COMPOUND_STRING("Snow continues to fall."));
        ReplayStream_Anim(REPLAY_SIDE_FAR, REPLAY_ANIM_SNOW_CONTINUES);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("Snow continues to fall.");
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SNOW_CONTINUES, farMon);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_SNOW);
    }
}

REPLAY_TEST("The snow stops: no weather")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_SNOW);
        ReplayStream_Weather(REPLAY_WEATHER_NONE);
        ReplayStream_Print(COMPOUND_STRING("The snow stopped."));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        MESSAGE("The snow stopped.");
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, B_WEATHER_NONE);
    }
}

REPLAY_TEST("The rain stops: no weather")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Weather(REPLAY_WEATHER_RAIN);
        ReplayStream_Weather(REPLAY_WEATHER_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gBattleWeather, 0);
    }
}

REPLAY_TEST("Substitute: the mon stays behind its substitute")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_NEAR, MOVE_SUBSTITUTE);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 75);
        ReplayStream_Volatile(REPLAY_SIDE_NEAR, REPLAY_VOLATILE_SUBSTITUTE, TRUE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT(nearMon->volatiles.substitute);
        EXPECT(IsBehindSubstitute(nearMon));
    }
}

REPLAY_TEST("Substitute on, a hit on it, then it fades: the mon is out again")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_NEAR, MOVE_SUBSTITUTE);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 75);
        ReplayStream_Volatile(REPLAY_SIDE_NEAR, REPLAY_VOLATILE_SUBSTITUTE, TRUE);
        ReplayStream_Move(REPLAY_SIDE_FAR, REPLAY_SIDE_NEAR, MOVE_ROCK_SLIDE);
        ReplayStream_Hit(REPLAY_SIDE_NEAR, REPLAY_EFFECTIVENESS_RESISTED);
        ReplayStream_Print(COMPOUND_STRING("Skarmory's substitute faded!"));
        ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_SUBSTITUTE_FADE);
        ReplayStream_Volatile(REPLAY_SIDE_NEAR, REPLAY_VOLATILE_SUBSTITUTE, FALSE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_ROCK_SLIDE, farMon, target: nearMon);
        MESSAGE("Skarmory's substitute faded!");
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_SUBSTITUTE_FADE, nearMon);
    }
    THEN
    {
        EXPECT(!nearMon->volatiles.substitute);
        EXPECT(!IsBehindSubstitute(nearMon));
    }
}

REPLAY_TEST("Trace: ABILITY sets the mon's ability")
{
    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_PORYGON2, 100);
        ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_SKARMORY, 100);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_Ability(REPLAY_SIDE_NEAR, ABILITY_KEEN_EYE, TRUE);
        ReplayStream_Print(COMPOUND_STRING("Porygon2 traced the opposing Skarmory's Keen Eye!"));
        ReplayStream_Ability(REPLAY_SIDE_NEAR, ABILITY_KEEN_EYE, FALSE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ABILITY_POPUP(nearMon, ABILITY_KEEN_EYE);
    }
    THEN
    {
        EXPECT_EQ(nearMon->ability, ABILITY_KEEN_EYE);
    }
}

REPLAY_TEST("A replay hides the HP numbers")
{
    STREAM
    {
        StartSkarmoryVsTyranitar();
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT(Replay_HidesHpNumbers());
    }
}

SINGLE_BATTLE_TEST("Replay: an upstream battle shows its HP numbers")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET);
        OPPONENT(SPECIES_WOBBUFFET);
    }
    WHEN
    {
        TURN { }
    }
    THEN
    {
        EXPECT(!Replay_HidesHpNumbers());
    }
}
