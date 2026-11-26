import { describe, expect, it } from 'vitest'

import { checkPlayerClient, setupIndices, singleClients } from './gen5-bw2-clients'

// Invented sources for the spec: pokebw2's function and parameter names, with parameters, clients,
// indices and orders of their own. The prototype puts `isAI` before `clientId`, so a reader that
// took the arguments by place fails.
const CLIENT_H = `BOOL BattleClient_IsGameTimeUp(BtlClient *client);
BtlClient *BattleClient_Create(BtlMainModule *mainModule, u8 isAI, BtlPokeCon *pokeCon,
                               u16 clientId, u32 extra, HeapID heapId);
void BattleClient_Delete(BtlClient *client);`

// The opponent's client comes first; the double battle's setup after it is a decoy.
const MAIN_C = `BOOL BtlMain_SetupAloneSingle(u32 *state, BtlMainModule *mainModule) {
    mainModule->clientCount = 3;
    // mainModule->clients[1] = BattleClient_Create(mainModule, 0, con, 1, 0, heap);
    mainModule->clients[0] =
        BattleClient_Create(mainModule, 5, &mainModule->pokeCons[2], 0, Mix(1, 2), mainModule->heapId);
    mainModule->clients[2] = BattleClient_Create(mainModule, 0, &mainModule->pokeCons[2], 2, 9, mainModule->heapId);
    return TRUE;
}
BOOL BtlMain_SetupAloneDouble(u32 *state, BtlMainModule *mainModule) {
    mainModule->clients[1] = BattleClient_Create(mainModule, 0, &mainModule->pokeCons[0], 1, 4, heap);
}`

// The trainer's loader takes `party` before `client`; the setup puts the player at 2 and the
// trainer at 3.
const SETUP_C = `static void BtlSetup_LoadTrainer(BtlSetup *setup, PokeParty **party, int trainerId, u32 client,
                                 HeapID heapId);
static void BtlSetup_LoadTrainer(BtlSetup *setup, PokeParty **party, int trainerId, u32 client,
                                 HeapID heapId) {
    if (setup->trainers[client] == NULL) {
        setup->trainers[client] = Create(heapId);
    }
}
static void BtlSetup_LoadPlayerParty(BtlSetup *setup, GameData *gameData, HeapID heapId) {
    setup->party[2] = PokeParty_Create(heapId);
    PokeParty_Copy(GameData_GetParty(gameData), setup->party[2]);
}
static void BtlSetup_LoadGameData(BtlSetup *setup, GameData *gameData, BtlFieldStatus *status) {
    setup->fieldSituation.playerClientId = 2;
    for (i = 0; i < 6; i++) {
        setup->playerInfo[i] = NULL;
    }
    setup->playerInfo[2] = GetGameDataPlayerInfo(gameData);
}
void BtlSetup_SetTrainer1v1Single(BtlSetup *setup, GameData *gameData, BtlFieldStatus *status, u32 trainerId,
                                  HeapID heapId) {
    BtlSetup_LoadTrainerBase(setup, gameData, 4, status, heapId);
    BtlSetup_LoadTrainer(setup, &setup->party[3], trainerId, 3, heapId);
}`

const swap = (source: string, from: string, to: string) => {
  expect(source).toContain(from)
  return source.replace(from, to)
}

// Scene: the moment hands the player's Pokémon to the player's client and the foe's to the AI's.
describe('singleClients', () => {
  it("reads the player's client and the opponent's from the single battle's setup, by name", () => {
    expect(singleClients(MAIN_C, CLIENT_H)).toEqual({ player: 2, opponent: 0 })
  })

  it('refuses a setup with no client or two of a side, or an argument that is no number', () => {
    const main = (from: string, to: string) => () => singleClients(swap(MAIN_C, from, to), CLIENT_H)
    expect(main('BattleClient_Create(mainModule, 5', 'Other(mainModule, 5')).toThrow(
      /0 clients as the opponent's/,
    )
    expect(main('BattleClient_Create(mainModule, 5', 'BattleClient_Create(mainModule, 0')).toThrow(
      /2 clients as the player's/,
    )
    expect(main('clients[0]', 'clients[1]')).toThrow(/another client's slot/)
    expect(main('pokeCons[2], 2,', 'pokeCons[2], TWO,')).toThrow(/clientId is "TWO"/)
    expect(main('AloneSingle', 'AloneTriple')).toThrow(/BtlMain_SetupAloneSingle/)
  })

  // Scene: a setup whose clients the reader cannot tell apart must stop the generator.
  it('refuses a third live create, a create without its isAI, and an isAI written as a name', () => {
    const main = (from: string, to: string) => () => singleClients(swap(MAIN_C, from, to), CLIENT_H)
    const third =
      'mainModule->clients[1] = BattleClient_Create(mainModule, 0, &mainModule->pokeCons[1], 1, 0, h);'
    expect(main('    return TRUE;', `    ${third}\n    return TRUE;`)).toThrow(
      /2 clients as the player's/,
    )
    expect(
      main('BattleClient_Create(mainModule, 5', 'BattleClient_Create(mainModule, TRUE'),
    ).toThrow(/isAI is "TRUE"/)
    const lastAI = swap(
      swap(CLIENT_H, 'u8 isAI,', 'u8 mode,'),
      'HeapID heapId);',
      'HeapID heapId, u8 isAI);',
    )
    expect(() => singleClients(MAIN_C, lastAI)).toThrow(/isAI is "undefined"/)
  })

  it('refuses a prototype without the parameters it reads', () => {
    const client = (from: string, to: string) => () =>
      singleClients(MAIN_C, swap(CLIENT_H, from, to))
    expect(client('u8 isAI', 'u8 ai')).toThrow(/no parameter isAI/)
    expect(client('u16 clientId', 'u16 id')).toThrow(/no parameter clientId/)
    expect(client('BtlClient *BattleClient_Create', 'BtlClient *BattleClient_Make')).toThrow(
      /no declaration of BattleClient_Create/,
    )
  })
})

// Scene: the park writes the player's party and name and the trainer's at their own elements.
describe('setupIndices', () => {
  it("reads each side's element of the setup's per-client arrays from the trainer battle's setup", () => {
    expect(setupIndices(SETUP_C)).toEqual({ player: 2, opponent: 3 })
  })

  it('refuses a trainer loaded twice, at another party, at the player, or at a named client', () => {
    const setup = (from: string, to: string) => () => setupIndices(swap(SETUP_C, from, to))
    const load = 'BtlSetup_LoadTrainer(setup, &setup->party[3], trainerId, 3, heapId);'
    expect(setup(load, `${load}\n${load}`)).toThrow(/2 times, not once/)
    expect(setup('&setup->party[3]', '&setup->party[1]')).toThrow(/outside its client's/)
    expect(setup('&setup->party[3]', 'setup->party')).toThrow(/party is "undefined"/)
    expect(setup('party[3], trainerId, 3,', 'party[2], trainerId, 2,')).toThrow(/player's element/)
    expect(setup('trainerId, 3, heapId', 'trainerId, OPPONENT, heapId')).toThrow(
      /client is "OPPONENT"/,
    )
  })

  it("refuses a player's party or info set twice or apart, and the info never set", () => {
    const setup = (from: string, to: string) => () => setupIndices(swap(SETUP_C, from, to))
    expect(setup('PokeParty_Copy(', 'setup->party[2] = Other(); PokeParty_Copy(')).toThrow(
      /the player's party 2 times/,
    )
    expect(setup('playerInfo[2] = Get', 'playerInfo[1] = Get')).toThrow(/player's info outside/)
    const info = 'setup->playerInfo[2] = GetGameDataPlayerInfo(gameData);'
    expect(setup(info, '')).toThrow(/the player's info 0 times/)
  })
})

// Scene: the battle takes the player's client from the setup, which must be the one not the AI.
describe('checkPlayerClient', () => {
  it("passes when the setup's playerClientId is the player's client and throws otherwise", () => {
    expect(() => {
      checkPlayerClient({ player: 2, opponent: 0 }, SETUP_C)
    }).not.toThrow()
    expect(() => {
      checkPlayerClient({ player: 0, opponent: 2 }, SETUP_C)
    }).toThrow(/playerClientId is not the client/)
  })

  it('throws when the setup sets playerClientId never or twice', () => {
    const named = 'setup->fieldSituation.playerClientId = 2;'
    const check = (setupC: string) => () => {
      checkPlayerClient({ player: 2, opponent: 0 }, setupC)
    }
    expect(check(swap(SETUP_C, named, ''))).toThrow(/playerClientId 0 times/)
    expect(check(swap(SETUP_C, named, `${named}\n    ${named}`))).toThrow(/playerClientId 2 times/)
  })
})
