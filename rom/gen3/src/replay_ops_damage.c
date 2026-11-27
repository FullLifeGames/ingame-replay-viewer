#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "battle_gfx_sfx_util.h"
#include "move.h"
#include "pokemon.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "test_runner.h"
#include "constants/battle.h"
#include "constants/battle_move_effects.h"
#include "constants/pokemon.h"
#include "constants/songs.h"

// The ops of a move and its damage (#6, #65, #68, #89): MOVE_TYPE, MOVE, HIT, HP, FAINT and
// SHOW_MON. Each emits its controller commands as the battle engine does for a move that hits
// (CancelerMoveAnimation, CancelerEffectivenessSound, CancelerHitAnimation,
// CancelerHealthBarUpdate in battle_move_resolution.c), for a mon that faints
// (BattleScript_FaintBattler) and for a user that a move left hidden (MoveEndAttackerVisible). HP
// also starts and stops the low-HP beep, as the engine's datahpupdate does. An op with two
// commands for one battler emits one per step, because a battler has one bufferA.

// The sound of each REPLAY_EFFECTIVENESS_*, as CancelerEffectivenessSound picks it.
static const u16 sEffectivenessSounds[] =
{
    [REPLAY_EFFECTIVENESS_NORMAL]   = SE_EFFECTIVE,
    [REPLAY_EFFECTIVENESS_SUPER]    = SE_SUPER_EFFECTIVE,
    [REPLAY_EFFECTIVENESS_RESISTED] = SE_NOT_EFFECTIVE,
};

// Transform's copy, as Cmd_transformdataexecution sets it before the move animation: the user
// counts as transformed and takes the target's personality and, by the Gen 4 rule
// (B_TRANSFORM_SHINY), its shininess. The controller hands both to the animation
// (BtlController_EmitMoveAnimation), which draws the copy's pic and palette from them
// (HandleSpeciesGfxDataChange); a later reload of the sprite, as after a substitute fades, draws
// them again for a transformed mon (BattleLoadMonSpriteGfx). The target's battle mon is the copy
// of its party mon (Replay_PutMonOnField). SwitchInClearSetData clears all three when the next mon
// enters (Replay_OpSwitchIn).
static void SetTransformedMon(u32 user, u32 target)
{
    gBattleMons[user].volatiles.transformed = TRUE;
    gBattleMons[user].volatiles.transformedMonPID = gBattleMons[target].personality;
    if (B_TRANSFORM_SHINY >= GEN_4)
        gBattleMons[user].volatiles.isTransformedMonShiny = gBattleMons[target].isShiny;
    else
        gBattleMons[user].volatiles.isTransformedMonShiny = gBattleMons[user].isShiny;
}

// MOVE_TYPE: the type the next MOVE's animation reads (GetBattleMoveType), as the engine sets
// gBattleStruct->dynamicMoveType before Ivy Cudgel's or Tera Blast's animation picks its look.
// MOVE clears it once its animation has played, and TURN clears one that no MOVE took.
bool32 Replay_OpMoveType(const volatile u8 *operands, u32 step)
{
    gBattleStruct->dynamicMoveType = operands[0];
    return TRUE;
}

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
    {
        gBattleStruct->dynamicMoveType = TYPE_NONE;
        return TRUE;
    }
    gBattlerAttacker = user;
    gBattlerTarget = Replay_GetBattler(operands[1]);
    gCurrentMove = move;
    if (GetMoveEffect(move) == EFFECT_TRANSFORM)
        SetTransformedMon(user, gBattlerTarget);
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
// and the battle mon get the new HP, as datahpupdate does after healthbarupdate. The controller
// that sets datahpupdate's HP starts or stops the low-HP beep of a near mon on the new HP
// (SetBattlerMonData in battle_controllers.c), and so does this op. The bar's end checks only the
// HP from before the op, so without this call the beep would follow one HP op late.
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
    if (IsOnPlayerSide(battler))
        HandleLowHpMusicChange(mon, battler);
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

// SHOW_MON: the side's mon shown again with no animation. A move animation can leave its user
// hidden: Fly, Dig, Dive and Bounce hide it on their charge turn, and only their hit shows it. On a
// hit turn that plays no animation (a miss, Protect, a full paralysis), the engine shows the user
// with the controller's sprite invisibility command (MoveEndAttackerVisible in
// battle_move_resolution.c), and so does this op. The controller leaves a visible mon as it is.
bool32 Replay_OpShowMon(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);

    if (step != 0)
        return TRUE;
    BtlController_EmitSpriteInvisibility(battler, B_COMM_TO_CONTROLLER, FALSE);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}
