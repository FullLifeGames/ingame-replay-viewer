// The invented texts that the Pokémon format's spec hands to the reader (#97): every size, table
// value, constant and cipher number is made up for it, and none is copied from pokebw2. The
// structs carry the member names the encoder reads, in an order and widths of their own.
// scripts/gen5-fixtures-real.test.ts holds that what the reader computes from them shows no
// number of build/gen5/bw2.json under the same name.
import type { PkmInput } from './gen5-bw2-pkm.ts'

export const TABLE = `// Invented: four rows, each a different order of four chunks of 24 bytes.
static const u8 blockShufLUT[4][4] = {
    { 0x18, 0x00, 0x48, 0x30 },
    { 72, 48, 24, 0 }, // a comment after a row
    { 48, 72, 0, 24 },
    { 24, 72, 0, 48 },
};`

export const PICKER = `void *PML_PkmGetParamBlockCore(BoxPkm *mon, u32 personality, u32 which) {
    u8 *first = mon->contentBuffer.chunks[0].rawData;
    return first + blockShufLUT[(personality & 0x300) >> 8][which];
}`

export const STEP = `static u16 PML_CryptoNextKey(u32 *seed);
static u16 PML_CryptoNextKey(u32 *seed) {
    *seed = *seed * 0x2f1 + 0x55u;
    return *seed >> 12;
}`

export const RARE = `BOOL PML_UtilPIDIsRare(u32 trainer, u32 personality) {
    return (TOP(trainer) ^ LOW(trainer) ^ TOP(personality) ^ LOW(personality)) < 5;
}`

export const TOOL = [TABLE, PICKER, STEP, RARE].join('\n\n')

export const PARTY = `#define PARTY_SIZE 3
enum { PKM_DATA_BLOCK_A = 2, PKM_DATA_BLOCK_B = 0, PKM_DATA_BLOCK_C = 3, PKM_DATA_BLOCK_D = 1 };
typedef struct { u8 rawData[24]; } PkmBufferChunk;
typedef struct { PkmBufferChunk chunks[4]; } PkmBuffer;
struct BoxPkm { u16 checksum; u16 marks; PkmBuffer contentBuffer; u32 pid; };
struct PartyPkm { BoxPkm base; u32 statusCond; u16 nowHP; u16 maxHP; u8 level; u8 spare;
    u16 atk; u16 def; u16 spa; u16 spd; u16 spe; MailData mail; };
struct PokeParty { u16 count; u8 slotExists; s32 capacity; u8 stamp[6];
    PartyPkm pkms[PARTY_SIZE]; };
typedef struct { u8 language; u8 friendship; u16 species; u32 exp; u8 ability; u8 mark;
    u16 item; u32 id; u8 spare[8]; } PkmBlockA;
typedef struct { u8 nature; u8 gender : 2; u8 form : 6; u8 ppUps[4]; u16 moves[4]; u8 pp[4];
    u32 isNicknamed : 1; u32 hpIV : 5; u32 atkIV : 5; u32 defIV : 5; u32 speIV : 5; u32 spaIV : 5;
    u32 spdIV : 5; u32 : 1; } PkmBlockB;
typedef struct { u16 nickname[8]; u8 originGame; } PkmBlockC;
typedef struct { u16 otName[6]; u8 ball; u8 metLevel : 7; u8 otGender : 1; } PkmBlockD;`

/** A whole invented input. */
export const PKM_INPUT: PkmInput = {
  pokeToolC: TOOL,
  partyH: PARTY,
  mailH: 'struct MailData { u32 sender; u16 lines[5]; };',
  pmsH: '',
  pokemonH: '#define GENDER_MALE 7\n#define GENDER_FEMALE 8\n#define GENDER_UNKNOWN 9',
  languageH: '#define LANGUAGE_KLINGON 1\n#define LANGUAGE_ENGLISH 4',
  versionH: '#define VERSION_WHITE2 30\n#define VERSION_BLACK2 31',
  speciesList: 'SPECIES_SEED\nSPECIES_BUDLING\nSPECIES_SHRUBLET = 7 # a gap\nSPECIES_TREANT\n',
  movesList: 'MOVE_NUDGE\nMOVE_POKE\nMOVE_PROD\n',
  itemsList: 'ITEM_PEBBLE\nITEM_POKE_BALL\nITEM_ACORN\n',
  abilitiesList: 'ABILITY_DRIFT\nABILITY_STURDY_ROOTS\n',
  naturesList: 'NATURE_CALM = 3\nNATURE_BOLD\n',
}
