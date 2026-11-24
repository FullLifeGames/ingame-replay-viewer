#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "move.h"
#include "pokemon.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "test_runner.h"
#include "constants/battle.h"
#include "constants/songs.h"

// The ops of a move and its damage (#6): MOVE, HIT, HP and FAINT. Each emits its controller
// commands as the battle engine does for a move that hits (CancelerMoveAnimation,
// CancelerEffectivenessSound, CancelerHitAnimation, CancelerHealthBarUpdate in
// battle_move_resolution.c) and for a mon that faints (BattleScript_FaintBattler). An op with two
// commands for one battler emits one per step, because a battler has one bufferA.

// The sound of each REPLAY_EFFECTIVENESS_*, as CancelerEffectivenessSound picks it.
static const u16 sEffectivenessSounds[] =
{
    [REPLAY_EFFECTIVENESS_NORMAL]   = SE_EFFECTIVE,
    [REPLAY_EFFECTIVENESS_SUPER]    = SE_SUPER_EFFECTIVE,
    [REPLAY_EFFECTIVENESS_RESISTED] = SE_NOT_EFFECTIVE,
};

// MOVE: the user's move animation against the target. The animation reads gBattlerAttacker and
// gBattlerTarget (DoMoveAnim), so they and gCurrentMove are set first. The animation turn goes to
// the controller as the stream gives it, as the engine passes gBattleScripting.animTurn. The stream
// gives no damage and no multi-hit count, so both are 0, as for a move that deals none.
bool32 Replay_OpMove(const volatile u8 *operands, u32 step)
{
    u32 user = Replay_GetBattler(operands[0]);
    enum Move move = Replay_ReadU16(operands + 2);
    u32 animTurn = operands[4];

    if (step != 0)
        return TRUE;
    gBattlerAttacker = user;
    gBattlerTarget = Replay_GetBattler(operands[1]);
    gCurrentMove = move;
    BtlController_EmitMoveAnimation(user, B_COMM_TO_CONTROLLER, move, animTurn, GetMovePower(move), 0, gBattleMons[user].friendship, 0);
    MarkBattlerForControllerExec(user);
    return FALSE;
}

// HIT: the effectiveness sound, which the test runner records as the engine does, then the hit
// animation of the mon that was hit.
bool32 Replay_OpHit(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 sound = sEffectivenessSounds[operands[1]];

    switch (step)
    {
    case 0:
        #if TESTING
        if (gTestRunnerEnabled)
            TestRunner_Battle_RecordEffectivenessSound(battler, sound);
        #endif
        BtlController_EmitPlaySE(battler, B_COMM_TO_CONTROLLER, sound);
        break;
    case 1:
        BtlController_EmitHitAnimation(battler, B_COMM_TO_CONTROLLER);
        break;
    default:
        return TRUE;
    }
    MarkBattlerForControllerExec(battler);
    return FALSE;
}

// HP: the HP bar moves from the party's HP to the stream's, at most the mon's max HP; the
// controller reads the old HP from the party (BtlController_HandleHealthBarUpdate). Then the party
// and the battle mon get the new HP, as datahpupdate does after healthbarupdate.
bool32 Replay_OpHp(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    struct Pokemon *mon = GetBattlerMon(battler);
    u32 hp = min(Replay_ReadU16(operands + 1), GetMonData(mon, MON_DATA_MAX_HP));

    if (step == 0)
    {
        BtlController_EmitHealthBarUpdate(battler, B_COMM_TO_CONTROLLER, GetMonData(mon, MON_DATA_HP) - hp);
        MarkBattlerForControllerExec(battler);
        return FALSE;
    }
    SetMonData(mon, MON_DATA_HP, &hp);
    gBattleMons[battler].hp = hp;
    return TRUE;
}

// FAINT: the mon's faint cry and a pause, then it leaves the field with the faint animation, as
// BattleScript_FaintBattler plays them (playfaintcry, pause, dofaintanimation).
//
// First the mon gets 0 HP. A log can faint a mon with HP left: Showdown gives the user of
// Explosion no HP line. The game's Explosion sets the user's HP to 0 before its faint
// (BattleScript_Explosion in data/battle_scripts_1.s):
//     tryexplosion
//     setatkhptozero
// and Cmd_setatkhptozero (src/battle_script_commands.c):
//     gBattleMons[gBattlerAttacker].hp = 0;
// With HP left, IsBattlerAlive holds, so a later faint on the other side would start a KO
// animation (AnimateMonAfterKnockout) on this mon's freed sprite, which never ends.
bool32 Replay_OpFaint(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 hp = 0;

    switch (step)
    {
    case 0:
        SetMonData(GetBattlerMon(battler), MON_DATA_HP, &hp);
        gBattleMons[battler].hp = hp;
        BtlController_EmitFaintingCry(battler, B_COMM_TO_CONTROLLER);
        Replay_Wait(B_WAIT_TIME_LONG);
        break;
    case 1:
        gBattleStruct->battlerState[battler].notOnField = TRUE;
        BtlController_EmitFaintAnimation(battler, B_COMM_TO_CONTROLLER);
        break;
    default:
        return TRUE;
    }
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
