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
#include "constants/moves.h"

// The ops of a switch (#6): WITHDRAW and SWITCH_IN, as a battle script switches a mon
// (returntoball, then switchindataupdate and switchinanim in BattleScript_EffectBatonPass and the
// switch scripts). After a faint the stream has no WITHDRAW: the faint animation has taken the mon
// off the field.

void Replay_ReturnMonToBall(u32 side)
{
    u32 battler = Replay_GetBattler(side);

    BtlController_EmitReturnMonToBall(battler, B_COMM_TO_CONTROLLER, FALSE);
    MarkBattlerForControllerExec(battler);
}

// The stream plays the battle log's disguise by its party slot, and the end of the disguise as a
// WITHDRAW and a SWITCH_IN of the real mon. The game's own Illusion would pick a disguise of its
// own, the last alive party member (SetIllusionMon), the first time a sprite, a healthbox or a
// message asks for it (GetIllusionMonPtr). So the mon that enters has it off before its
// animation reads it, as after B_ANIM_ILLUSION_OFF.
void Replay_KeepIllusionOff(u32 battler)
{
    gBattleStruct->illusion[battler].state = ILLUSION_OFF;
}

// WITHDRAW: the mon goes back into its ball.
bool32 Replay_OpWithdraw(const volatile u8 *operands, u32 step)
{
    if (step != 0)
        return TRUE;
    Replay_ReturnMonToBall(operands[0]);
    return FALSE;
}

// SWITCH_IN: the party mon takes the field, the engine clears what a mon that enters loses
// (SwitchInClearSetData: stat stages, volatiles, notOnField after a faint), and the ball releases
// it. After Baton Pass the stages and the substitute stay, as Cmd_switchindataupdate and
// switchinanim keep them; SwitchInClearSetData carries the volatiles over from the old copy.
// Baton Pass counts only for the switch of its user, and only once: the engine clears gCurrentMove
// when the action ends (HandleAction_ActionFinished), and so does this op, before
// SwitchInClearSetData reads it for any other switch and after it for the Baton Pass one.
bool32 Replay_OpSwitchIn(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 slot = operands[1];
    bool32 batonPass = (battler == gBattlerAttacker && GetMoveEffect(gCurrentMove) == EFFECT_BATON_PASS);
    struct BattlePokemon old;

    if (step != 0)
        return TRUE;
    old = gBattleMons[battler];
    Replay_PutMonOnField(battler, slot, Replay_ReadU16(operands + 2), operands[4]);
    if (batonPass)
        memcpy(gBattleMons[battler].statStages, old.statStages, sizeof(old.statStages));
    else
        gCurrentMove = MOVE_NONE;
    SwitchInClearSetData(battler, &old.volatiles);
    gCurrentMove = MOVE_NONE;
    Replay_KeepIllusionOff(battler);
    BtlController_EmitSwitchInAnim(battler, B_COMM_TO_CONTROLLER, slot, FALSE, batonPass);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
