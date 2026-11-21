#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "battle_main.h"
#include "move.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "constants/battle.h"
#include "constants/battle_move_effects.h"

// The ops of a switch (#6): WITHDRAW and SWITCH_IN, as a battle script switches a mon
// (returntoball, then switchindataupdate and switchinanim in BattleScript_EffectBatonPass and the
// switch scripts). After a faint the stream has no WITHDRAW: the faint animation has taken the mon
// off the field.

// WITHDRAW: the mon goes back into its ball.
bool32 Replay_OpWithdraw(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);

    if (step != 0)
        return TRUE;
    BtlController_EmitReturnMonToBall(battler, B_COMM_TO_CONTROLLER, FALSE);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}

// SWITCH_IN: the party mon takes the field, the engine clears what a mon that enters loses
// (SwitchInClearSetData: stat stages, volatiles, notOnField after a faint), and the ball releases
// it. After Baton Pass the stages and the substitute stay, as Cmd_switchindataupdate and
// switchinanim keep them; SwitchInClearSetData carries the volatiles over from the old copy.
bool32 Replay_OpSwitchIn(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 slot = operands[1];
    bool32 batonPass = (GetMoveEffect(gCurrentMove) == EFFECT_BATON_PASS);
    struct BattlePokemon old;

    if (step != 0)
        return TRUE;
    old = gBattleMons[battler];
    Replay_PutMonOnField(battler, slot, Replay_ReadU16(operands + 2), operands[4]);
    if (batonPass)
        memcpy(gBattleMons[battler].statStages, old.statStages, sizeof(old.statStages));
    SwitchInClearSetData(battler, &old.volatiles);
    BtlController_EmitSwitchInAnim(battler, B_COMM_TO_CONTROLLER, slot, FALSE, batonPass);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
