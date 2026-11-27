// The invented C that the flow reader's specs hand to it (#107, #108): the functions it reads, in
// an order of their own, each reduced to the shape the reader accepts, with numbers of our own and
// each callee's parameters in an order of their own. The message IDs match the lines of
// TEXT_INPUT (gen5-bw2-text.fixtures.ts), and four functions also put a message of the other
// command or kind as a decoy. The reader keeps the damage kinds, the heal effect, the recall
// effects and the faint's flag, so scripts/gen5-fixtures-real.test.ts compares those with the
// generated ones.
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
`,
  itemsC: `// Invented
static void HandlerLeftoversUse(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work);

static void HandlerLeftoversUse(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandler_StrSetup(&param->string, 5, 3);
    BattleHandler_StrSetup(&param->string, BTL_HANDLER_STRING_SET, 2);
}
`,
}
