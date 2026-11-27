#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"

// ANIM (#6): the stream's own animation numbers (REPLAY_ANIM_*) mapped to the game's. A general
// animation is a B_ANIM_* of the battle animation table, played as a battle script's
// playanimation plays it; a status animation is chosen by a STATUS1_* mask, as
// InitAndLaunchChosenStatusAnimation chooses it, so the table holds the mask.

enum ReplayAnimKind
{
    REPLAY_ANIM_KIND_GENERAL,
    REPLAY_ANIM_KIND_STATUS,
};

struct ReplayAnim
{
    u8 kind; // enum ReplayAnimKind
    u32 id;  // B_ANIM_* or STATUS1_*
};

static const struct ReplayAnim sAnims[] =
{
    [REPLAY_ANIM_SUBSTITUTE_FADE]     = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_SUBSTITUTE_FADE },
    [REPLAY_ANIM_HELD_ITEM_EFFECT]    = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_HELD_ITEM_EFFECT },
    [REPLAY_ANIM_HELD_ITEM_BERRY]     = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_HELD_ITEM_BERRY },
    [REPLAY_ANIM_RAIN_CONTINUES]      = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_RAIN_CONTINUES },
    [REPLAY_ANIM_SUN_CONTINUES]       = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_SUN_CONTINUES },
    [REPLAY_ANIM_SANDSTORM_CONTINUES] = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_SANDSTORM_CONTINUES },
    [REPLAY_ANIM_HAIL_CONTINUES]      = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_HAIL_CONTINUES },
    [REPLAY_ANIM_LEECH_SEED_DRAIN]    = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_LEECH_SEED_DRAIN },
    [REPLAY_ANIM_FOCUS_PUNCH_SETUP]   = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_FOCUS_PUNCH_SETUP },
    [REPLAY_ANIM_WISH_HEAL]           = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_WISH_HEAL },
    [REPLAY_ANIM_ITEM_STEAL]          = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_ITEM_STEAL },
    [REPLAY_ANIM_STATUS_PSN]          = { REPLAY_ANIM_KIND_STATUS,  STATUS1_POISON },
    [REPLAY_ANIM_STATUS_BRN]          = { REPLAY_ANIM_KIND_STATUS,  STATUS1_BURN },
    [REPLAY_ANIM_STATUS_SLP]          = { REPLAY_ANIM_KIND_STATUS,  STATUS1_SLEEP },
    [REPLAY_ANIM_STATUS_PRZ]          = { REPLAY_ANIM_KIND_STATUS,  STATUS1_PARALYSIS },
    [REPLAY_ANIM_STATUS_FRZ]          = { REPLAY_ANIM_KIND_STATUS,  STATUS1_FREEZE },
    [REPLAY_ANIM_SIMPLE_HEAL]         = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_SIMPLE_HEAL },
    [REPLAY_ANIM_SNOW_CONTINUES]      = { REPLAY_ANIM_KIND_GENERAL, B_ANIM_SNOW_CONTINUES },
};

STATIC_ASSERT(ARRAY_COUNT(sAnims) == REPLAY_ANIM_SNOW_CONTINUES + 1, ReplayAnimsCoverTheFormat);

// ANIM: the animation on the side's mon; the op ends when the controller has played it.
bool32 Replay_OpAnim(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    const struct ReplayAnim *anim = &sAnims[operands[1]];

    if (step != 0)
        return TRUE;
    if (anim->kind == REPLAY_ANIM_KIND_STATUS)
        BtlController_EmitStatusAnimation(battler, B_COMM_TO_CONTROLLER, FALSE, anim->id);
    else
        BtlController_EmitBattleAnimation(battler, B_COMM_TO_CONTROLLER, anim->id, 0);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}

// TRAP_TURN: the end-of-turn animation of a trapped mon. BattleScript_WrapTurnDmg plays
// B_ANIM_TURN_TRAP with the trapping move as its argument (HandleEndTurnWrap), and
// AnimTask_GetTrappedMoveAnimId picks that move's own animation from it: Fire Spin's, Whirlpool's,
// Clamp's, Sand Tomb's, or the squeeze of Bind and Wrap.
bool32 Replay_OpTrapTurn(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);

    if (step != 0)
        return TRUE;
    BtlController_EmitBattleAnimation(battler, B_COMM_TO_CONTROLLER, B_ANIM_TURN_TRAP, Replay_ReadU16(operands + 1));
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
