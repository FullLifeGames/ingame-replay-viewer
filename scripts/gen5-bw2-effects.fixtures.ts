// The invented C that the effect reader's specs hand to it (#109): the functions, tables and
// structs it reads, each reduced to the shape the reader accepts, in an order of their own, with
// numbers of our own and each callee's parameters in an order of their own. BattleCondition's
// `common` struct holds its members in an order and widths of its own, and its condition types
// count from a value of their own. A decoy case, a decoy handler table and a decoy literal stand
// beside the read ones. scripts/gen5-fixtures-real.test.ts compares what the reader computes from
// them, the poison constant and ITEM_NONE, with the generated numbers.
import type { EffectInput } from './gen5-bw2-effects.ts'

/** The battle's constants the reader adds to, by pokebw2's names. */
export const EFFECTS_CONSTANTS = { CONDITION_POISON: 0x41 }

/** The generated items that `checkEffectLiterals` holds the literals to: ITEM_NONE alone. */
export const EFFECTS_ITEMS = { ITEM_NONE: 0x2f }

export const EFFECTS_INPUT: EffectInput = {
  flowC: `// Invented
void ServerControl_ViewEffect(BtlServerFlow *flow, u8 pos2, u16 effect, u8 pos1, BOOL reserved) {
    BtlServerCmdQueue_Put(flow->queue, SC_EFFECT, effect);
}

BOOL ServerControl_ChangeWeather(BtlServerFlow *flow, u8 turns, u8 weather) {
    return TRUE;
}

void ServerControl_ConditionDamage(BtlServerFlow *flow, BattleMon *mon, u32 condition, u32 damage) {
    if (amount != 0) {
        switch (condition) {
        case CONDITION_BURN:
            ServerDisplay_AddEffectAtPosition(flow, mon, 0x7b3);
            break;
        case CONDITION_CURSE:
            ServerDisplay_AddEffectAtPosition(flow, mon, 0x7b9);
            break;
        case CONDITION_POISON:
            ServerDisplay_AddEffectAtPosition(flow, mon, 0x7b1);
            break;
        }
    }
}

BOOL ServerControl_TurnCheckWeather(BtlServerFlow *flow, BtlMonSet *monSet) {
    if (damaged) {
        ServerControl_ViewEffect(flow, BTL_POS_NONE, 0x7c5, 9, 0);
    }
    return FALSE;
}

void ServerControl_AddCondition(BtlServerFlow *flow, BattleMon *target, u32 condition) {
    ServerDisplay_AddCondition(flow, target, condition, value);
    switch (condition) {
    case CONDITION_SLEEP:
        ServerDisplay_AddEffectAtPosition(flow, target, 0x7a2);
        break;
    case CONDITION_FREEZE:
        ServerDisplay_AddEffectAtPosition(flow, target, 0x7a4);
        break;
    case CONDITION_CONFUSION:
        ServerDisplay_AddEffectAtPosition(flow, target, 0x7ac);
        break;
    case CONDITION_POISON:
        ServerDisplay_AddEffectAtPosition(flow, target, 0x7a6);
        break;
    case CONDITION_PARALYSIS:
        ServerDisplay_AddEffectAtPosition(flow, target, 0x7a8);
        break;
    case CONDITION_BURN:
        ServerDisplay_AddEffectAtPosition(flow, target, 0x7aa);
        break;
    }
}

BOOL ServerControl_TurnCheck(BtlServerFlow *flow) {
    switch (flow->turnCheckSeq) {
    case BTL_TURN_CHECK_SEQ_WEATHER:
        BtlServerCmdQueue_Put(flow->queue, SC_HIDE_MSG_WINDOW, 3);
        break;
    }
    return FALSE;
}

void ServerControl_WeatherDamage(BtlServerFlow *flow, BattleMon *mon, u32 weather, s32 damage) {
    if (damage > 0) {
        ServerControl_ViewEffect(flow, 9, 0x7c2, BtlServerFlow_MonIDToPos(flow, monId), 0);
        if (lethal) {
            ServerControl_ViewEffect(flow, 9, 0x7c5, 9, 0);
        }
    }
}

void ServerDisplay_AddCondition(BtlServerFlow *flow, BattleMon *mon, s32 condition, BattleCondition value) {
    if (condition < CONDITION_CONFUSION) {
        if (condition == CONDITION_POISON && Condition_IsBadlyPoisoned(value)) {
            condition = CONDITION_POISON + 3;
        }
        BtlServerCmdQueue_Put(flow->queue, SC_SET_GAUGE_STATUS, monId, condition);
    }
}

void ServerControl_ChangeHeldItem(BtlServerFlow *flow, BOOL consume, BattleMon *mon, u16 item) {
}

BOOL ServerControl_UseHeldItem(BtlServerFlow *flow, BattleMon *mon) {
    if (result) {
        ServerControl_ChangeHeldItem(flow, TRUE, mon, 0x2f);
    }
    return result;
}

u8 BattleHandler_EffectAtPos(BtlServerFlow *handler, const BattleHandlerEffectAtPosParam *param) {
    if (param->hideMessageWindow) {
        BtlServerCmdQueue_Put(handler->queue, SC_HIDE_MSG_WINDOW, 3);
    }
    return TRUE;
}

BOOL BtlServerFlow_StartBattle(BtlServerFlow *flow) {
    if (weather != 0 && ServerControl_ChangeWeather(flow, 0x3c, weather)) {
        flow->result = 2;
    }
    return TRUE;
}
`,
  mainC: `// Invented
u8 GetClientSide(BtlMainModule *mainModule, u8 clientId) {
    return clientId & 0x10;
}
`,
  calcC: `// Invented
u32 BtlCalc_RandomRange(u32 max, u32 min) {
    return min;
}

BattleCondition BtlCalc_MakeStatusCondition(u32 status) {
    switch (status) {
    case CONDITION_SLEEP:
        condition.common.turns = BtlCalc_RandomRange(9, 3);
        break;
    }
    return condition;
}
`,
  pokeparamH: `// Invented
enum {
    BTL_CONDITION_TYPE_NONE = 2,
    BTL_CONDITION_TYPE_TURNS,
    BTL_CONDITION_TYPE_PERMANENT,
};

#define BTL_CONDITION_BADLY_POISONED_TURNS 21

struct BattleCondition {
    union {
        u32 raw;
        struct {
            u32 monId : 8;
            u32 padding : 24;
        } mon;
        struct {
            u32 padding : 4;
            u32 turns : 7;
            u32 type : 5;
            u32 rest : 16;
        } common;
    };
};
`,
  posH: `// Invented
#define BTL_POS_NONE 9
`,
  abilitiesC: `// Invented
static const AbilityEventAddEntry sAbilityEventAddTable[] = {
    { ABILITY_SPEED_BOOST, EventAddSpeedBoost },
    { ABILITY_INTIMIDATE, EventAddIntimidate },
    { ABILITY_DROUGHT, EventAddDrizzle },
    { ABILITY_DRIZZLE, EventAddDrizzle },
};

static const BattleEventHandlerEntry sHandlersSpeedBoost[] = {
    { BTL_EVENT_TURN_CHECK_END, HandlerSpeedBoost },
};

const BattleEventHandlerEntry *EventAddSpeedBoost(u32 *priority) {
    *priority = NELEMS(sHandlersSpeedBoost);
    return sHandlersSpeedBoost;
}

const BattleEventHandlerEntry *EventAddDrizzle(u32 *priority) {
    *priority = NELEMS(sHandlersDrizzle);
    return sHandlersDrizzle;
}

static const BattleEventHandlerEntry sHandlersDrizzle[] = {
    { BTL_EVENT_CHANGE_ABILITY_AFTER, HandlerDrizzle },
    { BTL_EVENT_MEMBER_IN, HandlerDrizzle },
};

static const BattleEventHandlerEntry sHandlersIntimidate[] = {
    { BTL_EVENT_MEMBER_IN, HandlerIntimidateMemberIn },
};

const BattleEventHandlerEntry *EventAddIntimidate(u32 *priority) {
    *priority = NELEMS(sHandlersIntimidate);
    return sHandlersIntimidate;
}
`,
  movesC: `// Invented
static void HandlerKnockOff(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (heldItem != 0x2f) {
        param = BattleHandler_PushWork(flow, BTL_HANDLER_SET_ITEM, monId);
        param->item = 0x2f;
        BattleHandler_PopWork(flow, param);
    }
}

static void HandlerFocuspunch(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work);

static void HandlerFocuspunch(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BTL_EVAR_MON) == monId) {
        effect = BattleHandler_PushWork(flow, BTL_HANDLER_EFFECT_AT_POS, monId);
        effect->pos2 = 9;
        effect->effect = 0x7d1;
        BattleHandler_PopWork(flow, effect);
    }
}
`,
}
