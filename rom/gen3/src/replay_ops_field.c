#include "global.h"
#include "battle.h"
#include "battle_gfx_sfx_util.h"
#include "battle_interface.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "constants/battle.h"

// The ops of the field and the ability pop-ups (#6): WEATHER, VOLATILE and ABILITY. They change
// the battle's state and send no controller command; the animations and texts around them come
// as ops of their own.

// The gBattleWeather of each REPLAY_WEATHER_*: the weather a move or an ability starts. The
// stream says when it ends, so it gets no duration.
static const u16 sWeathers[] =
{
    [REPLAY_WEATHER_NONE] = B_WEATHER_NONE,
    [REPLAY_WEATHER_RAIN] = B_WEATHER_RAIN_NORMAL,
    [REPLAY_WEATHER_SUN]  = B_WEATHER_SUN_NORMAL,
    [REPLAY_WEATHER_SAND] = B_WEATHER_SANDSTORM,
    [REPLAY_WEATHER_HAIL] = B_WEATHER_HAIL,
};

STATIC_ASSERT(ARRAY_COUNT(sWeathers) == REPLAY_WEATHER_HAIL + 1, ReplayWeathersCoverFormatV2);

// WEATHER: the battle's weather.
bool32 Replay_OpWeather(const volatile u8 *operands, u32 step)
{
    gBattleWeather = sWeathers[operands[0]];
    return TRUE;
}

// VOLATILE: Substitute, the only volatile of format v2. The controller puts the mon's sprite
// behind its substitute after the Substitute move's animation (TrySetBehindSubstituteSpriteBit);
// when the substitute goes, the sprite bit goes with it, as the fade animation clears it on screen.
bool32 Replay_OpVolatile(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    bool32 on = operands[2];

    gBattleMons[battler].volatiles.substitute = on;
    if (!on)
        ClearBehindSubstituteBit(battler);
    return TRUE;
}

// ABILITY: the mon's ability, as Trace leaves it, and its pop-up. Show draws it as
// BS_ShowAbilityPopup does and waits B_WAIT_TIME_SHORT frames; hide lets it slide out as
// BS_DestroyAbilityPopup does, and the pop-up frees its own graphics once it is gone.
bool32 Replay_OpAbility(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 ability = Replay_ReadU16(operands + 1);

    if (step != 0)
        return TRUE;
    gBattleMons[battler].ability = ability;
    if (!operands[3])
    {
        DestroyAbilityPopUp(battler);
        return TRUE;
    }
    CreateAbilityPopUp(battler, ability, FALSE);
    Replay_Wait(B_WAIT_TIME_SHORT);
    return FALSE;
}
