#include "global.h"
#include "battle.h"
#include "battle_main.h"
#include "malloc.h"
#include "pokemon.h"
#include "recorded_battle.h"
#include "replay_interpreter.h"
#include "replay_stream.h"
#include "constants/battle.h"
#include "constants/characters.h"
#include "constants/trainers.h"

// The battle a replay plays in (#6): a recorded link battle, as the expansion's own singles tests
// start one (test/test_runner_battle.c). It needs no input: the recorded controllers play no
// menus, and BattlePutTextOnWindow scrolls text by itself in a recorded battle.

#define REPLAY_BATTLE_FLAGS (BATTLE_TYPE_IS_MASTER | BATTLE_TYPE_RECORDED_IS_MASTER | BATTLE_TYPE_RECORDED_LINK | BATTLE_TYPE_TRAINER)

static const volatile u8 *GetMon(const volatile u8 *stream, u32 side, u32 slot)
{
    return stream + REPLAY_STREAM_MONS_OFFSET + (side * REPLAY_STREAM_PARTY_SIZE + slot) * REPLAY_MON_SIZE;
}

static const volatile u8 *GetTrainer(const volatile u8 *stream, u32 side)
{
    return stream + REPLAY_STREAM_TRAINERS_OFFSET + side * REPLAY_TRAINER_SIZE;
}

static void CopyString(u8 *dest, const volatile u8 *src, u32 length)
{
    u32 i;

    for (i = 0; i < length; i++)
        dest[i] = src[i];
    dest[length] = EOS;
}

// A mon of a team table: species and level, the nickname, and HP on the battle log's scale.
static void CreateReplayMon(struct Pokemon *mon, const volatile u8 *entry)
{
    u8 nickname[REPLAY_MON_NICKNAME_LENGTH];
    u32 hp = Replay_ReadU16(entry + REPLAY_MON_OFFSET_MAX_HP);

    CreateMon(mon, Replay_ReadU16(entry + REPLAY_MON_OFFSET_SPECIES), entry[REPLAY_MON_OFFSET_LEVEL], 0, OTID_STRUCT_PRESET(0));
    CopyString(nickname, entry + REPLAY_MON_OFFSET_NICKNAME, POKEMON_NAME_LENGTH);
    SetMonData(mon, MON_DATA_NICKNAME, nickname);
    SetMonData(mon, MON_DATA_MAX_HP, &hp);
    SetMonData(mon, MON_DATA_HP, &hp);
}

static void FillParties(struct RecordedBattleSave *save, const volatile u8 *stream)
{
    u32 side, slot;

    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
    {
        for (slot = 0; slot < REPLAY_STREAM_PARTY_SIZE; slot++)
        {
            const volatile u8 *entry = GetMon(stream, side, slot);
            if (Replay_ReadU16(entry + REPLAY_MON_OFFSET_SPECIES) != SPECIES_NONE)
                CreateReplayMon(&save->parties[side][slot], entry);
        }
    }
}

// The link players are the two trainers, near side first. Their names are cut to the length of
// a link player's name; the stream's PRINT texts carry the full names.
static void FillLinkPlayers(struct RecordedBattleSave *save, const volatile u8 *stream)
{
    u32 i;

    for (i = 0; i < MAX_LINK_PLAYERS; i++)
    {
        if (i < REPLAY_STREAM_SIDE_COUNT)
            CopyString(save->playersName[i], GetTrainer(stream, i) + REPLAY_TRAINER_OFFSET_NAME, PLAYER_NAME_LENGTH);
        else
            save->playersName[i][0] = EOS;
        save->playersLanguage[i] = GAME_LANGUAGE;
        save->playersBattlers |= (i << (2 * (i >> 1) + 4 * (i & BIT_SIDE)));
    }
}

enum ReplayError Replay_Start(const volatile u8 *stream, u32 length, enum ReplayEnd end, MainCallback afterBattle)
{
    struct RecordedBattleSave *save;
    enum ReplayError error = Replay_Load(stream, length, end);

    if (error != REPLAY_ERROR_NONE)
        return error;
    save = AllocZeroed(sizeof(*save));
    FillParties(save, stream);
    FillLinkPlayers(save, stream);
    save->battleFlags = REPLAY_BATTLE_FLAGS;
    save->opponentA = TRAINER_LINK_OPPONENT;
    save->textSpeed = OPTIONS_TEXT_SPEED_FAST;
    gBattleTypeFlags = save->battleFlags;
    SetVariablesForRecordedBattle(save);
    Free(save);
    gMain.savedCallback = afterBattle;
    SetMainCallback2(CB2_InitBattle);
    return REPLAY_ERROR_NONE;
}
