#ifndef GUARD_REPLAY_STREAM_H
#define GUARD_REPLAY_STREAM_H

// The instruction stream, version 2: the Gen 3 game backend writes it into the replay slot's
// stream (replay_slot.h) and the ROM interpreter plays it. src/gen3/stream/format.ts holds the same
// numbers; its spec checks that both files define the same REPLAY_* names with the same values.
// Keep each value a plain number.
//
// All little-endian. The stream header and the team tables sit at even offsets, so the structs
// below can read them. The instructions after the tables are byte-packed: read them byte by byte.
// The interpreter refuses a version it does not know, an unknown op, and an op with a fixed size
// whose size byte differs.

#define REPLAY_STREAM_VERSION        2
#define REPLAY_STREAM_HEADER_SIZE    0x10
#define REPLAY_STREAM_SIDE_COUNT     2
#define REPLAY_STREAM_PARTY_SIZE     6
#define REPLAY_STREAM_TRAINERS_OFFSET 0x10
#define REPLAY_STREAM_MONS_OFFSET    0x40
#define REPLAY_STREAM_TABLES_END     0x160

// Byte offsets of the stream header's fields.
#define REPLAY_STREAM_OFFSET_VERSION             0x00
#define REPLAY_STREAM_OFFSET_HEADER_SIZE         0x02
#define REPLAY_STREAM_OFFSET_TRAINER_SIZE        0x04
#define REPLAY_STREAM_OFFSET_MON_SIZE            0x05
#define REPLAY_STREAM_OFFSET_RESERVED            0x06
#define REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET 0x08
#define REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH 0x0C

// A trainer of the trainer table, near side first. The name is in the game's charset, padded
// with EOS, and holds at least one EOS.
#define REPLAY_TRAINER_SIZE               24
#define REPLAY_TRAINER_NAME_LENGTH        20
#define REPLAY_TRAINER_OFFSET_NAME        0
#define REPLAY_TRAINER_OFFSET_TRAINER_PIC 20
#define REPLAY_TRAINER_OFFSET_TEAM_SIZE   22
#define REPLAY_TRAINER_OFFSET_REVEALED    23

// A mon of a party table, indexed by side and party slot. A slot whose species is 0 is empty,
// whatever its other bytes (Replay_HoldsMon); the backend writes an empty slot as all zero.
#define REPLAY_MON_SIZE                 24
#define REPLAY_MON_NICKNAME_LENGTH      13
#define REPLAY_MON_OFFSET_SPECIES       0
#define REPLAY_MON_OFFSET_MAX_HP        2
#define REPLAY_MON_OFFSET_LEVEL         4
#define REPLAY_MON_OFFSET_GENDER        5
#define REPLAY_MON_OFFSET_SHINY         6
#define REPLAY_MON_OFFSET_RESERVED      7
#define REPLAY_MON_OFFSET_NICKNAME      8
#define REPLAY_MON_OFFSET_RESERVED_TAIL 21

// The lowest max HP a mon may not have: the expansion's INSTANT_HP_BAR_DROP
// (battle_controllers.h), which the health bar reads as "empty the bar at once".
#define REPLAY_MON_MAX_HP_LIMIT 0x7FFF

// An instruction: u8 op, u8 size, then size bytes of operands. In the operands, side is a
// REPLAY_SIDE_*, slot a party index, and HP is on the battle log's scale (maxHp of its mon).
#define REPLAY_INSTRUCTION_HEADER_SIZE 2

#define REPLAY_OP_END            0x00 // outcome u8 (REPLAY_OUTCOME_*); the last instruction
#define REPLAY_OP_TURN           0x01 // number u16
#define REPLAY_OP_PRINT          0x02 // text in the game's charset, ends with EOS; no line breaks
#define REPLAY_OP_INTRO          0x03 // no operands
#define REPLAY_OP_SEND_OUT       0x04 // side u8, slot u8, hp u16, status u8 (REPLAY_STATUS_*)
#define REPLAY_OP_WITHDRAW       0x05 // side u8
#define REPLAY_OP_SWITCH_IN      0x06 // side u8, slot u8, hp u16, status u8 (REPLAY_STATUS_*)
#define REPLAY_OP_MOVE           0x07 // user side u8, target side u8, move u16 (MOVE_*)
#define REPLAY_OP_HIT            0x08 // side u8, effectiveness u8 (REPLAY_EFFECTIVENESS_*)
#define REPLAY_OP_HP             0x09 // side u8, hp u16
#define REPLAY_OP_FAINT          0x0A // side u8
#define REPLAY_OP_STATUS         0x0B // side u8, slot u8, status u8 (REPLAY_STATUS_*)
#define REPLAY_OP_STAT           0x0C // side u8, stat u8 (REPLAY_STAT_*), stages s8, arrows u8 (REPLAY_ARROWS_*)
#define REPLAY_OP_ANIM           0x0D // side u8, anim u8 (REPLAY_ANIM_*)
#define REPLAY_OP_WEATHER        0x0E // weather u8 (REPLAY_WEATHER_*)
#define REPLAY_OP_VOLATILE       0x0F // side u8, volatile u8 (REPLAY_VOLATILE_*), on u8
#define REPLAY_OP_ABILITY        0x10 // side u8, ability u16 (ABILITY_*), show u8
#define REPLAY_OP_ITEM           0x11 // side u8, slot u8, item u16 (ITEM_*)
#define REPLAY_OP_ITEM_POP_UP    0x12 // side u8, item u16 (ITEM_*): the pop-up of a held item that takes effect
#define REPLAY_OP_TRAP_TURN      0x13 // side u8, move u16 (MOVE_*): the trapping move
#define REPLAY_OP_FLUSH_TEXT_BOX 0x14 // no operands: empties the text box, as flushtextbox does

// The size byte of each op but PRINT.
#define REPLAY_OP_END_SIZE            1
#define REPLAY_OP_TURN_SIZE           2
#define REPLAY_OP_INTRO_SIZE          0
#define REPLAY_OP_SEND_OUT_SIZE       5
#define REPLAY_OP_WITHDRAW_SIZE       1
#define REPLAY_OP_SWITCH_IN_SIZE      5
#define REPLAY_OP_MOVE_SIZE           4
#define REPLAY_OP_HIT_SIZE            2
#define REPLAY_OP_HP_SIZE             3
#define REPLAY_OP_FAINT_SIZE          1
#define REPLAY_OP_STATUS_SIZE         3
#define REPLAY_OP_STAT_SIZE           4
#define REPLAY_OP_ANIM_SIZE           2
#define REPLAY_OP_WEATHER_SIZE        1
#define REPLAY_OP_VOLATILE_SIZE       3
#define REPLAY_OP_ABILITY_SIZE        4
#define REPLAY_OP_ITEM_SIZE           4
#define REPLAY_OP_ITEM_POP_UP_SIZE    3
#define REPLAY_OP_TRAP_TURN_SIZE      3
#define REPLAY_OP_FLUSH_TEXT_BOX_SIZE 0

// PRINT's size byte: one glyph and EOS at least.
#define REPLAY_PRINT_MIN_SIZE 2
#define REPLAY_PRINT_MAX_SIZE 255

// The stream's own enums. Species, moves, abilities, items and trainer pics are the expansion's
// numbers; the interpreter maps these to the game's own.
#define REPLAY_SIDE_NEAR 0 // the battler at B_POSITION_PLAYER_LEFT
#define REPLAY_SIDE_FAR  1 // the battler at B_POSITION_OPPONENT_LEFT

#define REPLAY_GENDER_MALE   0
#define REPLAY_GENDER_FEMALE 1
#define REPLAY_GENDER_NONE   2

#define REPLAY_OUTCOME_NEAR_WON 0
#define REPLAY_OUTCOME_FAR_WON  1
#define REPLAY_OUTCOME_TIE      2
#define REPLAY_OUTCOME_UNKNOWN  3

#define REPLAY_STATUS_NONE 0
#define REPLAY_STATUS_SLP  1
#define REPLAY_STATUS_PSN  2
#define REPLAY_STATUS_BRN  3
#define REPLAY_STATUS_FRZ  4
#define REPLAY_STATUS_PAR  5
#define REPLAY_STATUS_TOX  6

#define REPLAY_WEATHER_NONE 0
#define REPLAY_WEATHER_RAIN 1
#define REPLAY_WEATHER_SUN  2
#define REPLAY_WEATHER_SAND 3
#define REPLAY_WEATHER_HAIL 4

// The order of enum Stat.
#define REPLAY_STAT_ATK      1
#define REPLAY_STAT_DEF      2
#define REPLAY_STAT_SPE      3
#define REPLAY_STAT_SPA      4
#define REPLAY_STAT_SPD      5
#define REPLAY_STAT_ACCURACY 6
#define REPLAY_STAT_EVASION  7

// Which stat arrows a STAT shows: none, those of one stat, or those of several.
#define REPLAY_ARROWS_NONE    0
#define REPLAY_ARROWS_ONE     1
#define REPLAY_ARROWS_SEVERAL 2

#define REPLAY_EFFECTIVENESS_NORMAL   0 // SE_EFFECTIVE
#define REPLAY_EFFECTIVENESS_SUPER    1 // SE_SUPER_EFFECTIVE
#define REPLAY_EFFECTIVENESS_RESISTED 2 // SE_NOT_EFFECTIVE

#define REPLAY_VOLATILE_SUBSTITUTE 1

// General and status animations; the interpreter's table maps each to a B_ANIM_* or a status
// animation id.
#define REPLAY_ANIM_SUBSTITUTE_FADE     1
#define REPLAY_ANIM_HELD_ITEM_EFFECT    2
#define REPLAY_ANIM_HELD_ITEM_BERRY     3
#define REPLAY_ANIM_RAIN_CONTINUES      4
#define REPLAY_ANIM_SUN_CONTINUES       5
#define REPLAY_ANIM_SANDSTORM_CONTINUES 6
#define REPLAY_ANIM_HAIL_CONTINUES      7
#define REPLAY_ANIM_LEECH_SEED_DRAIN    8
#define REPLAY_ANIM_FOCUS_PUNCH_SETUP   9
#define REPLAY_ANIM_WISH_HEAL           10
#define REPLAY_ANIM_ITEM_STEAL          11
#define REPLAY_ANIM_STATUS_PSN          12
#define REPLAY_ANIM_STATUS_BRN          13
#define REPLAY_ANIM_STATUS_SLP          14
#define REPLAY_ANIM_STATUS_PRZ          15
#define REPLAY_ANIM_STATUS_FRZ          16
#define REPLAY_ANIM_SIMPLE_HEAL         17

struct ReplayStreamHeader
{
    u16 version; // REPLAY_STREAM_VERSION
    u16 headerSize;
    u8 trainerSize;
    u8 monSize;
    u16 reserved;
    u32 instructionsOffset; // from the start of the stream
    u32 instructionsLength;
};

struct ReplayTrainer
{
    u8 name[REPLAY_TRAINER_NAME_LENGTH];
    u16 trainerPic; // enum TrainerPicID
    u8 teamSize;
    u8 revealed;
};

struct ReplayMon
{
    u16 species; // SPECIES_*; SPECIES_NONE for an empty slot
    u16 maxHp;
    u8 level;
    u8 gender; // REPLAY_GENDER_*
    u8 shiny;
    u8 reserved;
    u8 nickname[REPLAY_MON_NICKNAME_LENGTH]; // POKEMON_NAME_LENGTH glyphs and EOS, padded with EOS
    u8 reservedTail[REPLAY_MON_SIZE - REPLAY_MON_OFFSET_RESERVED_TAIL];
};

// The start of the stream, before its instructions.
struct ReplayStreamTables
{
    struct ReplayStreamHeader header;
    struct ReplayTrainer trainers[REPLAY_STREAM_SIDE_COUNT];
    struct ReplayMon mons[REPLAY_STREAM_SIDE_COUNT][REPLAY_STREAM_PARTY_SIZE];
};

STATIC_ASSERT(offsetof(struct ReplayStreamHeader, version) == REPLAY_STREAM_OFFSET_VERSION, ReplayStreamVersionOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamHeader, headerSize) == REPLAY_STREAM_OFFSET_HEADER_SIZE, ReplayStreamHeaderSizeOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamHeader, trainerSize) == REPLAY_STREAM_OFFSET_TRAINER_SIZE, ReplayStreamTrainerSizeOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamHeader, monSize) == REPLAY_STREAM_OFFSET_MON_SIZE, ReplayStreamMonSizeOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamHeader, reserved) == REPLAY_STREAM_OFFSET_RESERVED, ReplayStreamReservedOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamHeader, instructionsOffset) == REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET, ReplayStreamInstructionsOffsetOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamHeader, instructionsLength) == REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, ReplayStreamInstructionsLengthOffset);
STATIC_ASSERT(sizeof(struct ReplayStreamHeader) == REPLAY_STREAM_HEADER_SIZE, ReplayStreamHeaderSize);

STATIC_ASSERT(offsetof(struct ReplayTrainer, name) == REPLAY_TRAINER_OFFSET_NAME, ReplayTrainerNameOffset);
STATIC_ASSERT(offsetof(struct ReplayTrainer, trainerPic) == REPLAY_TRAINER_OFFSET_TRAINER_PIC, ReplayTrainerPicOffset);
STATIC_ASSERT(offsetof(struct ReplayTrainer, teamSize) == REPLAY_TRAINER_OFFSET_TEAM_SIZE, ReplayTrainerTeamSizeOffset);
STATIC_ASSERT(offsetof(struct ReplayTrainer, revealed) == REPLAY_TRAINER_OFFSET_REVEALED, ReplayTrainerRevealedOffset);
STATIC_ASSERT(sizeof(struct ReplayTrainer) == REPLAY_TRAINER_SIZE, ReplayTrainerSize);

STATIC_ASSERT(offsetof(struct ReplayMon, species) == REPLAY_MON_OFFSET_SPECIES, ReplayMonSpeciesOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, maxHp) == REPLAY_MON_OFFSET_MAX_HP, ReplayMonMaxHpOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, level) == REPLAY_MON_OFFSET_LEVEL, ReplayMonLevelOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, gender) == REPLAY_MON_OFFSET_GENDER, ReplayMonGenderOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, shiny) == REPLAY_MON_OFFSET_SHINY, ReplayMonShinyOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, reserved) == REPLAY_MON_OFFSET_RESERVED, ReplayMonReservedOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, nickname) == REPLAY_MON_OFFSET_NICKNAME, ReplayMonNicknameOffset);
STATIC_ASSERT(offsetof(struct ReplayMon, reservedTail) == REPLAY_MON_OFFSET_RESERVED_TAIL, ReplayMonReservedTailOffset);
STATIC_ASSERT(sizeof(struct ReplayMon) == REPLAY_MON_SIZE, ReplayMonSize);
STATIC_ASSERT(REPLAY_MON_NICKNAME_LENGTH == POKEMON_NAME_LENGTH + 1, ReplayMonNicknameLength);

STATIC_ASSERT(offsetof(struct ReplayStreamTables, trainers) == REPLAY_STREAM_TRAINERS_OFFSET, ReplayStreamTrainersOffset);
STATIC_ASSERT(offsetof(struct ReplayStreamTables, mons) == REPLAY_STREAM_MONS_OFFSET, ReplayStreamMonsOffset);
STATIC_ASSERT(sizeof(struct ReplayStreamTables) == REPLAY_STREAM_TABLES_END, ReplayStreamTablesEnd);
STATIC_ASSERT(REPLAY_STREAM_PARTY_SIZE == PARTY_SIZE, ReplayStreamPartySize);

#endif // GUARD_REPLAY_STREAM_H
