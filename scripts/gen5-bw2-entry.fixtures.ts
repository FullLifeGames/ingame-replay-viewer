// The invented texts that the direct entry's spec hands to the reader (#97): every address,
// offset and value is made up for it, and none is copied from pokebw2. The structs carry the
// member names the entry reads, in an order and widths of their own.
// scripts/gen5-fixtures-real.test.ts holds that what the reader computes from them shows no
// number of build/gen5/bw2.json under the same name.
import { ENTRY_FUNCTIONS, type EntryInput } from './gen5-bw2-entry.ts'

const symbolLines = (names: readonly string[], kind: string, from: number) =>
  names.map((name, at) => `${name} ${kind} addr:0x${(from + at * 0x10).toString(16)}`).join('\n')

export const link = (start: number, end: number) =>
  `    .text       start:0x${start.toString(16)} end:0x${end.toString(16)} kind:code align:32\n\n`

/** A whole invented input: tiny structs with the members the entry reads, and invented numbers. */
export const ENTRY_INPUT: EntryInput = {
  arm9Symbols: [
    symbolLines(ENTRY_FUNCTIONS, 'kind:function(thumb,size=0x20)', 0x02004000),
    symbolLines(['sGameProcManager', 'sBootScreensParam'], 'kind:bss', 0x02100000),
    'EVENT_TITLE_FUNCS kind:data(any) addr:0x02080000',
  ].join('\n'),
  bootScreensSymbols: 'BOOT_SCREENS_PROC_FUNCTIONS kind:data(any) addr:0x02200000 ambiguous',
  battleSymbols: 'BATTLE_PROC_FUNCTIONS kind:data(any) addr:0x02190100 ambiguous',
  battleOverlay: 'ov101',
  battleLink: link(0x02190000, 0x02190600),
  bootLinks: { ov004: link(0x02180000, 0x02190000), ov031: link(0x021a0000, 0x021a0800) },
  gameMainC:
    'static void GameInit(void) { GFL_OvlLoad(OVERLAY_ID(4)); GFL_OvlLoad(OVERLAY_ID(31)); }',
  procsysC: `struct GameProcManager { u16 spin; void *nextParam; BOOL queued; u8 lead[3];
    s32 nextOverlayId; const GameProcFunctions *nextFunctions; };`,
  heapH: 'typedef u16 HeapID;\nenum { HEAPID_SYSTEM = 0x0, HEAPID_USER = 0x5 };',
  overlayH: '#define OVERLAY_NONE (-3)',
  soundH: '#define SND_CHANNEL_MASK_ALL 0xff',
  strbufC: 'struct StrBuf { u32 stamp; u16 size; u8 tag; u16 length; u16 chars[3]; };',
  setupH: `struct BtlFieldSituation { u16 winBgm; u16 bgm; };
struct BtlSetupTrainer { u16 badge; StrBuf *name; u8 trainerClass; };
struct BtlSetup { u8 mode; BtlFieldSituation fieldSituation; GameData *gameData;
    PokeParty *party[5]; u32 battleStyle; PlayerInfo *playerInfo[5]; Config *config;
    BtlSetupTrainer *trainers[5]; MATHRandContext32 rand; };`,
  regulationH: '',
  pmsH: '#define PMS_WORDS 2\nstruct PMSData { u16 type; u16 words[PMS_WORDS]; };',
  fieldEventH: 'struct BtlFieldStatus { u8 weather; u16 light; };',
  mathH: 'typedef struct { u64 x; u64 mul; } MATHRandContext32;',
  partyH: `#define PARTY_SIZE 4
struct PartyPkm { u16 marks; MailData mail; };
struct PokeParty { u16 count; u8 slotExists; s32 capacity; u32 stamp;
    PartyPkm pkms[PARTY_SIZE]; };`,
  mailH: 'struct MailData { u32 trainerId; u16 words[3]; };',
  playerInfoH: 'struct PlayerInfo { u8 gender; u16 name[6]; };',
  configH: `enum { CONFIG_TEXT_SPEED_SLOW = 0, CONFIG_TEXT_SPEED_FAST = 3 };
struct Config { u8 frame : 3; u8 textSpeed : 2; u8 : 3; };`,
  battleProcH: '#define OVERLAY_BATTLE_MAIN OVERLAY_ID(101)',
  trainerClasses: 'TRAINER_CLASS_HIKER = 0\nTRAINER_CLASS_YOUNGSTER\n',
  printsysC: '#define CHAR_NEWLINE 0xe000\n#define CHAR_EOM 0xfffe',
  battleH: '#define BTL_STYLE_SINGLE 4\n#define BTL_STYLE_DOUBLE 9',
  soundList: 'SEQ_SILENCE\nSEQ_BGM_VS_WILD = 100\nSEQ_BGM_VS_TRAINER\n',
  setupC: `static void Kite_Init(Kite *kite) { kite->name = GFL_StrBufCreate(3, heapId); }
BtlSetupTrainer *TrainerBattleSetup_Create(HeapID heapId) {
    BtlSetupTrainer *trainer = GFL_HeapAllocate(heapId, sizeof(BtlSetupTrainer), TRUE, "x.c", 9);

    trainer->name = GFL_StrBufCreate(12, heapId);
    return trainer;
}
static void BtlSetup_LoadTrainer(BtlSetup *setup, u32 client, PokeParty **party, HeapID heapId);
static void BtlSetup_LoadPlayerParty(BtlSetup *setup, HeapID heapId) {
    setup->party[3] = PokeParty_Create(heapId);
}
static void BtlSetup_LoadGameData(BtlSetup *setup, GameData *gameData) {
    setup->playerInfo[3] = GetGameDataPlayerInfo(gameData);
}
void BtlSetup_SetTrainer1v1Single(BtlSetup *setup, u32 trainerId, HeapID heapId) {
    BtlSetup_LoadTrainer(setup, 2, &setup->party[2], heapId);
}`,
}
