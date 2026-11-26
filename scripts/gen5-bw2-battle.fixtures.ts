// The invented sources that the battle's spec hands to the reader (#77, #93): every number is made
// up for it, and none is copied from pokebw2. scripts/gen5-fixtures-real.test.ts holds that what
// the reader computes from them shows no number of build/gen5/bw2.json under the same name.
import type { BattleSources } from './gen5-bw2-battle.ts'

/** The battle spec's sources: the struct and member names the reader looks up, among members,
 * orders and sizes of their own. */
export const BATTLE_SOURCES: BattleSources = {
  serverC: 'enum { STEP_ZERO, STEP_ONE = 4, BTL_SERVER_ACTION_SEQ_WAIT_SELECT, STEP_LAST };',
  serverH: `typedef BOOL (*Turn)(int *n);
struct BtlServer { u8 open; u16 round; Turn turn; void *pokeCon; Mystery tail[COUNT]; };`,
  mainH: `struct BattleParty { u8 count; void *mons[3]; };
struct BtlPokeCon { BOOL forServer; u16 round; BattleParty parties[2]; void *mainModule; };
struct BtlMainModule { u16 id; void *server; Mystery rest[COUNT]; };`,
  // The setup puts the clients out of order, so a reader that assumed client = position fails, and
  // gives the battle a third client that no create call makes. The multi battle's setup before it,
  // with an invented count, is a decoy for the reader.
  mainC: `static BOOL BtlMain_SetupMulti(u32 *state, BtlMainModule *m) { m->clientCount = 5; }
BOOL BtlMain_SetupAloneSingle(u32 *state, BtlMainModule *mainModule) {
    switch (*state) {
    case 0:
        mainModule->clientCount = 3; // three clients
        mainModule->posClientIds[0] = 1;
        mainModule->posClientIds[1] = 2;
        mainModule->posClientIds[2] = 0;
        mainModule->clients[0] = BattleClient_Create(mainModule, 6, 0);
        mainModule->clients[1] = BattleClient_Create(mainModule, 0, 1);
        break;
    }
    return FALSE;
}`,
  // The prototype puts `isAI` before `clientId`; client 1 is the player's, client 0 the AI's.
  clientH: 'BtlClient *BattleClient_Create(BtlMainModule *mainModule, u8 isAI, u16 clientId);',
  pokeparamH: `typedef struct { u16 hp; u32 seen; u16 species; u8 monId; Mystery more[COUNT]; } BattleMonCore;
struct BattleMon { BattleMonCore core; s8 boost; };`,
}
