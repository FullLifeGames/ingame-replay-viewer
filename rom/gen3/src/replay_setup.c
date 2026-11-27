#include "global.h"
#include "battle.h"
#include "battle_main.h"
#include "malloc.h"
#include "pokemon.h"
#include "random.h"
#include "recorded_battle.h"
#include "replay_interpreter.h"
#include "replay_stream.h"
#include "constants/battle.h"
#include "constants/characters.h"
#include "constants/global.h"
#include "constants/pokemon.h"
#include "constants/trainers.h"

// The battle a replay plays in (#6): a recorded link battle, as the expansion's own singles tests
// start one (test/test_runner_battle.c). It needs no input: the recorded controllers play no
// menus, and BattlePutTextOnWindow scrolls text by itself in a recorded battle.

#define REPLAY_BATTLE_FLAGS (BATTLE_TYPE_IS_MASTER | BATTLE_TYPE_RECORDED_IS_MASTER | BATTLE_TYPE_RECORDED_LINK | BATTLE_TYPE_TRAINER)

// Each side's trainer pic from the stream, for the recorded controllers (patch 0004). A side is
// the battler's side: REPLAY_SIDE_NEAR stands at B_POSITION_PLAYER_LEFT.
static EWRAM_DATA u16 sTrainerPics[REPLAY_STREAM_SIDE_COUNT] = {0};

STATIC_ASSERT(REPLAY_SIDE_NEAR == B_SIDE_PLAYER, ReplaySideNearIsPlayerSide);
STATIC_ASSERT(REPLAY_SIDE_FAR == B_SIDE_OPPONENT, ReplaySideFarIsOpponentSide);

static void CopyString(u8 *dest, const volatile u8 *src, u32 length)
{
    u32 i;

    for (i = 0; i < length; i++)
        dest[i] = src[i];
    dest[length] = EOS;
}

// DrawPersonality's gender of each REPLAY_GENDER_*. It gives a species of one gender, or of none,
// its own.
static const u8 sGenders[] =
{
    [REPLAY_GENDER_MALE]   = MON_MALE,
    [REPLAY_GENDER_FEMALE] = MON_FEMALE,
    [REPLAY_GENDER_NONE]   = MON_GENDERLESS,
};

// A side's link player gender when its trainer pic is neither BRENDAN nor MAY (S3a D9).
static const u8 sDefaultGenders[] =
{
    [REPLAY_SIDE_NEAR] = MALE,
    [REPLAY_SIDE_FAR]  = FEMALE,
};

// The personalities come from a generator of the replay's own (#103). A mon's nature picks which
// of its back set's three animations a near mon plays (LaunchAnimationTaskForBackSprite), and the
// shared generator's state at the start differs between the engines: on mGBA the VBlanks of the
// stream check advance it, and the WebAssembly module runs that check in no time. The replay's
// generator starts from REPLAY_PERSONALITY_SEED (replay_interpreter.h), 129600, the seed of the
// fixed clock both engines boot with (SeedRngWithRtc), and SetSaveBlocksPointers takes its first
// draw at boot, so the replay's generator skips one draw. The module draws what it drew before,
// and only mGBA's natures move.

// GetMonPersonality with NATURE_RANDOM and RANDOM_UNOWN_LETTER, drawn from rng. A species of one
// gender or none, or a request of no gender, takes the first draw (CleanIncompatibleGenderSpecies);
// any other draws until the personality gives the gender.
static u32 DrawPersonality(rng_value_t *rng, u32 species, u32 gender)
{
    u32 personality;

    switch (gSpeciesInfo[species].genderRatio)
    {
    case MON_MALE:
    case MON_FEMALE:
    case MON_GENDERLESS:
        return LocalRandom32(rng);
    }
    if (gender == MON_GENDERLESS)
        return LocalRandom32(rng);
    do
    {
        personality = LocalRandom32(rng);
    }
    while (GetGenderFromSpeciesAndPersonality(species, personality) != gender);
    return personality;
}

// A mon of a team table: species, level, gender and shininess, the nickname, and HP on the battle
// log's scale. Only the gender comes from the stream; the rest of the personality comes from the
// replay's generator.
static void CreateReplayMon(struct Pokemon *mon, const volatile u8 *entry, rng_value_t *rng)
{
    u8 nickname[REPLAY_MON_NICKNAME_LENGTH];
    u32 species = Replay_ReadU16(entry + REPLAY_MON_OFFSET_SPECIES);
    u32 hp = Replay_ReadU16(entry + REPLAY_MON_OFFSET_MAX_HP);
    u32 personality = DrawPersonality(rng, species, sGenders[entry[REPLAY_MON_OFFSET_GENDER]]);
    u8 shiny = entry[REPLAY_MON_OFFSET_SHINY];

    CreateMon(mon, species, entry[REPLAY_MON_OFFSET_LEVEL], personality, OTID_STRUCT_PRESET(0));
    SetMonData(mon, MON_DATA_IS_SHINY, &shiny);
    CopyString(nickname, entry + REPLAY_MON_OFFSET_NICKNAME, POKEMON_NAME_LENGTH);
    SetMonData(mon, MON_DATA_NICKNAME, nickname);
    SetMonData(mon, MON_DATA_MAX_HP, &hp);
    SetMonData(mon, MON_DATA_HP, &hp);
}

// The unrevealed team members of a side (#21): the mons of its team size that the battle log never
// names. The intro's ball display reads each party slot, and a slot of SPECIES_NONE shows as an
// empty circle (DoBattleIntro, BATTLE_INTRO_STATE_DRAW_PARTY_SUMMARY, in battle_main.c). Each
// empty slot up to the team size, at most PARTY_SIZE, gets a copy of the side's first revealed
// mon, with full HP and no status, so it shows as a ball. It never reaches the field:
// Replay_Validate refuses a slot operand whose stream slot holds no mon.
static void FillUnrevealedTeamMembers(struct Pokemon *party, const volatile u8 *stream, u32 side, rng_value_t *rng)
{
    u32 slot, mons = 0;
    u32 teamSize = min(Replay_GetTrainer(stream, side)[REPLAY_TRAINER_OFFSET_TEAM_SIZE], PARTY_SIZE);
    const volatile u8 *firstMon = NULL;

    for (slot = 0; slot < REPLAY_STREAM_PARTY_SIZE; slot++)
    {
        if (!Replay_HoldsMon(stream, side, slot))
            continue;
        if (firstMon == NULL)
            firstMon = Replay_GetMon(stream, side, slot);
        mons++;
    }
    // Replay_Validate refuses a side without a mon, so firstMon is set here.
    for (slot = 0; slot < REPLAY_STREAM_PARTY_SIZE && mons < teamSize; slot++)
    {
        if (Replay_HoldsMon(stream, side, slot))
            continue;
        CreateReplayMon(&party[slot], firstMon, rng);
        mons++;
    }
}

static void FillParties(struct RecordedBattleSave *save, const volatile u8 *stream, rng_value_t *rng)
{
    u32 side, slot;

    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
    {
        for (slot = 0; slot < REPLAY_STREAM_PARTY_SIZE; slot++)
        {
            if (Replay_HoldsMon(stream, side, slot))
                CreateReplayMon(&save->parties[side][slot], Replay_GetMon(stream, side, slot), rng);
        }
        FillUnrevealedTeamMembers(save->parties[side], stream, side, rng);
    }
}

// The recorded controllers draw BRENDAN for a male link player and MAY for a female one.
static u32 GetLinkPlayerGender(const volatile u8 *stream, u32 side)
{
    switch (Replay_ReadU16(Replay_GetTrainer(stream, side) + REPLAY_TRAINER_OFFSET_TRAINER_PIC))
    {
    case TRAINER_PIC_BRENDAN:
        return MALE;
    case TRAINER_PIC_MAY:
        return FEMALE;
    default:
        return sDefaultGenders[side];
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
        {
            CopyString(save->playersName[i], Replay_GetTrainer(stream, i) + REPLAY_TRAINER_OFFSET_NAME, PLAYER_NAME_LENGTH);
            save->playersGender |= GetLinkPlayerGender(stream, i) << i;
        }
        else
        {
            save->playersName[i][0] = EOS;
        }
        save->playersLanguage[i] = GAME_LANGUAGE;
        save->playersBattlers |= (i << (2 * (i >> 1) + 4 * (i & BIT_SIDE)));
    }
}

// Replay_Validate refused a pic the side cannot draw (ValidateTeams), so the controllers draw each
// one as it is.
static void KeepTrainerPics(const volatile u8 *stream)
{
    u32 side;

    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
        sTrainerPics[side] = Replay_ReadU16(Replay_GetTrainer(stream, side) + REPLAY_TRAINER_OFFSET_TRAINER_PIC);
}

u32 Replay_GetTrainerPic(u32 battler, u32 fallback)
{
    if (!Replay_IsLoaded())
        return fallback;
    return sTrainerPics[GetBattlerSide(battler)];
}

enum ReplayError Replay_Start(const volatile u8 *stream, u32 length, enum ReplayEnd end, MainCallback afterBattle)
{
    struct RecordedBattleSave *save;
    rng_value_t rng;
    enum ReplayError error = Replay_Load(stream, length, end);

    if (error != REPLAY_ERROR_NONE)
        return error;
    rng = LocalRandomSeed(REPLAY_PERSONALITY_SEED);
    LocalRandom32(&rng);
    save = AllocZeroed(sizeof(*save));
    FillParties(save, stream, &rng);
    FillLinkPlayers(save, stream);
    KeepTrainerPics(stream);
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
