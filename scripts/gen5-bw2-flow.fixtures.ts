// The invented C that the flow reader's specs hand to it (#107, #108) and the line check's specs
// (#109): the functions it reads and the functions that put or pick the backend's lines, in an
// order of their own, each reduced to the shape the reader accepts, with numbers of our own and
// each callee's parameters in an order of their own. The message IDs match the lines of
// TEXT_INPUT (gen5-bw2-text.fixtures.ts), and some functions also put a message of the other
// command or kind as a decoy. The reader keeps the damage kinds, the heal effect, the recall
// effects, the faint's flag and the charge's release index (#110), so
// scripts/gen5-fixtures-real.test.ts compares those with the generated ones.
import type { FlowInput } from './gen5-bw2-flow.ts'

export const FLOW_INPUT: FlowInput = {
  flowC: `// Invented
enum {
    BTL_HANDLER_STRING_SET = 6,
    BTL_HANDLER_STRING_STANDARD = 5,
};

void ServerDisplay_CriticalHitMessage(BtlServerFlow *flow, BOOL multipleTargets) {
    if (multipleTargets) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 4, monId, SC_MSG_ARG_END);
    } else {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 1, SC_MSG_ARG_END);
    }
}

void ServerControl_RecoverHPCore(BtlServerFlow *flow, BattleMon *mon, u16 amount) {
    if (pos != BTL_POS_NONE) {
        BtlServerCmdQueue_Put(flow->queue, SC_EFFECT_BY_POS, pos, 0x9c);
    }
}

void ServerDisplay_FaintPokemon(u32 flag, BtlServerFlow *flow, BattleMon *mon) {
    BtlServerCmdQueue_Put(flow->queue, SC_FAINT_HP_GAUGE, GetMonID(mon), flag);
}

BOOL ServerControl_SwitchOut(BtlServerFlow *handler, BattleMon *mon) {
    if (!IsFainted(mon)) {
        ServerControl_SwitchOutCore(handler, 0x6e5, mon);
    }
    return TRUE;
}

BOOL ServerControl_CheckFainted(BtlServerFlow *flow, BattleMon *mon) {
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 5, SC_MSG_ARG_END);
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 7, monId, SC_MSG_ARG_END);
    return TRUE;
}

void ServerDisplay_DoesntAffect(BtlServerFlow *flow, BattleMon *mon) {
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 0, GetMonID(mon), SC_MSG_ARG_END);
}

void ServerDisplay_Damage(BtlServerFlow *flow, u32 count, BattleMon **mons) {
    u32 kind;
    if (superEffective) {
        kind = 7;
    } else if (notVeryEffective) {
        kind = 4;
    } else {
        kind = 5;
    }
    BtlServerCmdQueue_Put(flow->queue, SC_DAMAGE_PLURAL, (u8)count, (u8)kind, move);
}

void ServerControl_ForceSwitch(BtlServerFlow *flow, BattleMon *mon, BtlMonSet *targets) {
    while ((target = BtlMonSet_GetNext(targets)) != NULL) {
        if (ServerControl_ForceSwitchCore(flow, &failed, 0x6eb, target)) {
            flow->result = 1;
        }
    }
}

void ServerControl_SwitchOutCore(BtlServerFlow *flow, u32 effect, BattleMon *mon) {
    BtlServerCmdQueue_Put(flow->queue, SC_RECALL, pos, effect);
}

void ServerDisplay_MoveFailed(BtlServerFlow *flow, BattleMon *mon, u16 move) {
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 4, SC_MSG_ARG_END);
}

void ServerDisplay_EffectivenessMessageMulti(BtlServerFlow *flow, BOOL multipleTargets) {
    if (multipleTargets) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 1, monIds[0], SC_MSG_ARG_END);
    } else if (superEffective) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 6, SC_MSG_ARG_END);
    } else if (notVeryEffective) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 3, SC_MSG_ARG_END);
    }
}

BOOL ServerControl_ForceSwitchCore(BtlServerFlow *flow, BOOL *failed, u16 effect,
                                   BattleMon *target) {
    ServerControl_SwitchOutCore(flow, effect, target);
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 5, newMonId, SC_MSG_ARG_END);
    return TRUE;
}

void ServerControl_FaintPokemon(BtlServerFlow *flow, BattleMon *mon) {
    ServerDisplay_FaintPokemon(2, flow, mon);
}

void ServerDisplay_MoveAvoided(BtlServerFlow *flow, BattleMon *mon, u16 move) {
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 2, SC_MSG_ARG_END);
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 3, GetMonID(mon), SC_MSG_ARG_END);
}

void ServerControl_BreakSubstitute(BtlServerFlow *flow, BattleMon *mon) {
    ServerDisplay_SkyDropTargetAppear(flow, mon, 40);
}

void ServerDisplay_StatChangeLimit(BtlServerFlow *flow, BattleMon *mon, int change) {
    if (change > 0) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 45, monId, stat, SC_MSG_ARG_END);
    } else {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 24, monId, stat, SC_MSG_ARG_END);
    }
}

void ServerControl_CureStatus(BtlServerFlow *flow, BattleMon *mon, u32 status) {
    switch (status) {
    case CONDITION_FREEZE:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 22, monId, SC_MSG_ARG_END);
        break;
    case CONDITION_SLEEP:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 36, monId, SC_MSG_ARG_END);
        break;
    default:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 54, monId, SC_MSG_ARG_END);
    }
}

void ServerDisplay_SideEffectEnd(BtlServerFlow *flow, u32 effect, u32 side) {
    s32 message = -1;
    if (effect == SIDE_CONDITION_STEALTH_ROCK) {
        message = 8;
    } else if (effect == SIDE_CONDITION_SPIKES) {
        message = 2;
    }
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, message, side, SC_MSG_ARG_END);
}

void ServerControl_Substitute(BtlServerFlow *flow, BattleMon *mon) {
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 26, GetMonID(mon), SC_MSG_ARG_END);
    ServerDisplay_SkyDropTargetAppear(flow, mon, 9);
}

void ServerControl_WeatherDamage(BtlServerFlow *flow, BattleMon *mon, u8 weather) {
    if (weather == BTL_WEATHER_HAIL) {
        BattleHandler_StrSetup(&flow->message, 6, 37);
    } else {
        BattleHandler_StrSetup(&flow->message, 6, 51);
    }
    ServerControl_ViewEffect(flow, 12, pos, 13, 0, 0);
}

void ServerDisplay_MoveFailMessage(BtlServerFlow *flow, BattleMon *mon, u32 cause) {
    switch (cause) {
    case 7:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 52, monId, SC_MSG_ARG_END);
        break;
    case 3:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 32, monId, SC_MSG_ARG_END);
        break;
    case 9:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 14, monId, SC_MSG_ARG_END);
        break;
    case 2:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 42, monId, SC_MSG_ARG_END);
        break;
    case 5:
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, 15, monId, SC_MSG_ARG_END);
    }
}

void ServerControl_DamageDrain(BtlServerFlow *flow, BattleMon *attacker, BattleMon *target) {
    ServerDisplay_SkyDropTargetAppear(flow, target, 29);
}

void ServerDisplay_StatChange(BtlServerFlow *flow, BattleMon *mon, int change, int context) {
    if (change < 0) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 15, monId, stat, actual, SC_MSG_ARG_END);
    } else if (context == 0) {
        BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 34, monId, stat, actual, SC_MSG_ARG_END);
    }
}

void ServerControl_RemoveNoEffectTargets(BtlServerFlow *flow, BattleMon *mon) {
    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_SET, 17, GetMonID(target), SC_MSG_ARG_END);
}

u32 ServerControl_CheckChargeTurn(BtlServerFlow *flow, u16 move, BtlMonSet *targets,
                                  BattleMon *mon) {
    u32 result;
    flow->moveEffect->index = 0x13;
    result = ServerEvent_ChargeRelease(flow, mon, targets, move);
    return result ? BTL_CHARGE_RELEASED : BTL_CHARGE_RELEASE_FAILED;
}

u16 ServerControl_DamageSubstitute(BtlServerFlow *flow, BattleMon *target, u16 damage) {
    ServerDisplay_EffectivenessMessageMulti(flow, 1, &effectiveness, &target, FALSE);
    ServerDisplay_SkyDropTargetAppear(flow, target, 8);
    return damage;
}
`,
  itemsC: `// Invented
static void HandlerLeftoversUse(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work);

static void HandlerLifeOrbReaction(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 6, 21);
}

static void HandlerLeftoversUse(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 5, 3);
    BattleHandler_StrSetup(&param->string, BTL_HANDLER_STRING_SET, 2);
}

static void HandlerAirBalloonDamageReaction(BattleEventItem *item, BtlServerFlow *flow, u8 monId) {
    BattleHandler_StrSetup(&param->string, 6, 12);
}

static void HandlerToxicOrb(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 6, 25);
}

static void HandlerCustapBerryUse(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, BTL_HANDLER_STRING_SET, 30);
}

static void HandlerAirBalloonMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId) {
    BattleHandler_StrSetup(&param->string, 6, 50);
}

static void HandlerSitrusBerryUse(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 6, 44);
}
`,
  movesC: `// Invented
static void HandlerFocuspunch(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    effect->effect = 11;
    BattleHandler_StrSetup(&message->string, 6, 35);
}

static void HandlerKnockOff(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 6, 16);
}

static void HandlerStealthRock(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonCreateSideEffect(item, flow, monId, work, side, 4, cont, 10);
}

static void HandlerSolarBeamCharge(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&msg->string, 5, 3);
    BattleHandler_StrSetup(&msg->string, 6, 56);
}

static void HandlerProtect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&msgParam->string, 6, 47);
}
`,
  abilitiesC: `// Invented
static void HandlerRoughSkin(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 6, 41);
}
`,
  sideC: `// Invented
static void HandlerSideStealthRock(BattleEventItem *item, BtlServerFlow *flow, u8 side) {
    BattleHandler_StrSetup(&damage->string, 6, 20);
}
`,
  conditionsC: `// Invented
static s32 GetConditionAddMessage(s32 condition, BattleCondition value);

static s32 GetConditionDamageMessage(u32 condition) {
    switch (condition) {
    case CONDITION_BURN:
        return 10;
    case CONDITION_CURSE:
        return 2;
    case CONDITION_POISON:
        return 49;
    }
    return -1;
}

static s32 GetConditionAddMessage(s32 condition, BattleCondition value) {
    s32 message = -1;
    switch (condition) {
    case CONDITION_SLEEP:
        message = 19;
        break;
    case CONDITION_POISON:
        message = Condition_IsBadlyPoisoned(value) ? 46 : 31;
        break;
    case CONDITION_PARALYSIS:
        message = 39;
        break;
    case CONDITION_CONFUSION:
        message = 13;
        break;
    case CONDITION_BURN:
        message = 11;
        break;
    case CONDITION_FREEZE:
        message = 27;
        break;
    }
    return message;
}
`,
}
