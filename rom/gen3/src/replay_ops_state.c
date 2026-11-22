#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "battle_controllers.h"
#include "battle_interface.h"
#include "pokemon.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/pokemon.h"

// The ops of a mon's state (#6, #19): STATUS, STAT, ITEM and ITEM_POP_UP. Both parties are local
// in a recorded battle, so each writes the party mon itself; the battle mon changes only while that
// party mon is on the field.

static bool32 IsOnField(u32 battler, u32 slot)
{
    return slot == gBattlerPartyIndexes[battler] && !gBattleStruct->battlerState[battler].notOnField;
}

// STATUS: the party status first, because the status icon reads it from the party
// (BtlController_HandleStatusIconUpdate), then status1 and the icon of a mon on the field. A
// benched mon gets no icon.
bool32 Replay_OpStatus(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 slot = operands[1];
    u32 status1 = Replay_GetStatus1(operands[2]);

    if (step != 0)
        return TRUE;
    SetMonData(&GetBattlerParty(battler)[slot], MON_DATA_STATUS, &status1);
    if (!IsOnField(battler, slot))
        return TRUE;
    gBattleMons[battler].status1 = status1;
    BtlController_EmitStatusIconUpdate(battler, B_COMM_TO_CONTROLLER, status1);
    MarkBattlerForControllerExec(battler);
    return FALSE;
}

// The argument of B_ANIM_STATS_CHANGE, as TryPlayStatChangeAnimation builds it: the stat's own
// arrows, or the grey ones of several stats, for one stage or for two and more.
static u32 GetStatAnimId(u32 stat, s32 stages, u32 arrows)
{
    bool32 byTwo = (abs(stages) > 1);

    if (stages < 0 && arrows == REPLAY_ARROWS_SEVERAL)
        return byTwo ? STAT_ANIM_MULTIPLE_MINUS2 : STAT_ANIM_MULTIPLE_MINUS1;
    if (stages < 0)
        return stat + (byTwo ? STAT_ANIM_MINUS2 : STAT_ANIM_MINUS1);
    if (arrows == REPLAY_ARROWS_SEVERAL)
        return byTwo ? STAT_ANIM_MULTIPLE_PLUS2 : STAT_ANIM_MULTIPLE_PLUS1;
    return stat + (byTwo ? STAT_ANIM_PLUS2 : STAT_ANIM_PLUS1);
}

// The format's stats stand for enum Stat (constants/pokemon.h), so STAT indexes statStages and
// builds the arrows' id with them as they are.
STATIC_ASSERT(REPLAY_STAT_ATK == STAT_ATK, ReplayStatAtkIsStatAtk);
STATIC_ASSERT(REPLAY_STAT_DEF == STAT_DEF, ReplayStatDefIsStatDef);
STATIC_ASSERT(REPLAY_STAT_SPE == STAT_SPEED, ReplayStatSpeIsStatSpeed);
STATIC_ASSERT(REPLAY_STAT_SPA == STAT_SPATK, ReplayStatSpaIsStatSpatk);
STATIC_ASSERT(REPLAY_STAT_SPD == STAT_SPDEF, ReplayStatSpdIsStatSpdef);
STATIC_ASSERT(REPLAY_STAT_ACCURACY == STAT_ACC, ReplayStatAccuracyIsStatAcc);
STATIC_ASSERT(REPLAY_STAT_EVASION == STAT_EVASION, ReplayStatEvasionIsStatEvasion);

// STAT: the stage changes by the stream's stages, kept to MIN_STAT_STAGE..MAX_STAT_STAGE. The
// first STAT of a run plays the arrows for the whole run, as the engine plays one animation per
// stat change; the others come with REPLAY_ARROWS_NONE. A change of 0 plays none: the engine
// shows no arrows for a stat that cannot rise or fall further.
bool32 Replay_OpStat(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 stat = operands[1];
    s32 stages = (s8)operands[2];
    u32 arrows = operands[3];
    s32 stage = gBattleMons[battler].statStages[stat] + stages;

    if (step != 0)
        return TRUE;
    gBattleMons[battler].statStages[stat] = min(max(stage, MIN_STAT_STAGE), MAX_STAT_STAGE);
    if (arrows == REPLAY_ARROWS_NONE || stages == 0)
        return TRUE;
    BtlController_EmitBattleAnimation(battler, B_COMM_TO_CONTROLLER, B_ANIM_STATS_CHANGE, GetStatAnimId(stat, stages, arrows));
    MarkBattlerForControllerExec(battler);
    return FALSE;
}

// ITEM: the held item, as an item is taken, used or revealed.
bool32 Replay_OpItem(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);
    u32 slot = operands[1];
    u32 item = Replay_ReadU16(operands + 2);

    SetMonData(&GetBattlerParty(battler)[slot], MON_DATA_HELD_ITEM, &item);
    if (IsOnField(battler, slot))
        gBattleMons[battler].item = item;
    return TRUE;
}

// ITEM_POP_UP: the pop-up of the side's held item, as BattleScript_ItemPopUp_Scripting shows it.
// flushtextbox empties the text box first, showitempopup draws the pop-up with gLastUsedItem's
// name, and after B_WAIT_TIME_LONG frames destroyitempopup waits until it has slid out by itself.
// Only this battler's pop-up holds the op, so an ability pop-up still up on the other side does
// not; the graphics go with the last pop-up, as in BS_DestroyItemPopup.
bool32 Replay_OpItemPopUp(const volatile u8 *operands, u32 step)
{
    u32 battler = Replay_GetBattler(operands[0]);

    switch (step)
    {
    case 0:
        Replay_FlushTextBox();
        return FALSE;
    case 1:
        gLastUsedItem = Replay_ReadU16(operands + 1);
        CreateItemPopUp(battler);
        Replay_Wait(B_WAIT_TIME_LONG);
        return FALSE;
    default:
        if (gBattleStruct->battlerState[battler].activeAbilityPopUps)
            return FALSE;
        if (!IsAnyAbilityPopUpActive())
            FreeAbilityPopUpGfx();
        return TRUE;
    }
}
