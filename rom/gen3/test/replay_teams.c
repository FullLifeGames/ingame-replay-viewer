#include "global.h"
#include "battle.h"
#include "data.h"
#include "link.h"
#include "pokemon.h"
#include "random.h"
#include "sprite.h"
#include "trainer.h"
#include "test/replay_test.h"
#include "constants/global.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/trainers.h"

// The battle's trainers and teams come from the stream's tables (#6): each mon's gender and
// shininess, and each link player's gender (male for BRENDAN, female for MAY).

static void SetTrainerPics(u32 nearPic, u32 farPic)
{
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_NEAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, nearPic);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_FAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, farPic);
}

REPLAY_TEST("A mon takes its gender and shininess from the team table")
{
    STREAM
    {
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 0) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_FEMALE);
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 0) + REPLAY_MON_OFFSET_SHINY, TRUE);
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_MALE);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(GetMonGender(&gParties[B_TRAINER_PLAYER][0]), MON_FEMALE);
        EXPECT(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_IS_SHINY));
        EXPECT(nearMon->isShiny);
        EXPECT_EQ(GetGenderFromSpeciesAndPersonality(farMon->species, farMon->personality), MON_MALE);
        EXPECT(!farMon->isShiny);
    }
}

REPLAY_TEST("Trainer pics BRENDAN and MAY give the link players their gender")
{
    STREAM
    {
        SetTrainerPics(TRAINER_PIC_MAY, TRAINER_PIC_BRENDAN);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gLinkPlayers[REPLAY_SIDE_NEAR].gender, FEMALE);
        EXPECT_EQ(gLinkPlayers[REPLAY_SIDE_FAR].gender, MALE);
    }
}

REPLAY_TEST("Other trainer pics give the near side male and the far side female")
{
    STREAM
    {
        SetTrainerPics(TRAINER_PIC_STEVEN, TRAINER_PIC_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gLinkPlayers[REPLAY_SIDE_NEAR].gender, MALE);
        EXPECT_EQ(gLinkPlayers[REPLAY_SIDE_FAR].gender, FEMALE);
    }
}

// The recorded controllers draw each side's trainer pic from the stream (#20, patch 0004): the
// near side its back pic, the far side its front pic. INTRO draws both trainers and the first
// SEND_OUT (op 1) starts while both still stand; its ball throw frees the sprite.

REPLAY_TEST("A far trainer pic of RED draws Red")
{
    STREAM
    {
        SetTrainerPics(TRAINER_PIC_BRENDAN, TRAINER_PIC_RED);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        const struct ReplayTestTrainerSprite *trainer = ReplayTest_TrainerSpriteAtOpStart(1, REPLAY_SIDE_FAR);

        EXPECT(trainer->inUse);
        EXPECT_EQ(trainer->affineParam, TRAINER_PIC_RED);
        EXPECT_EQ(trainer->paletteTag, GetTrainerPicTag(TRAINER_PIC_RED, TRUE));
    }
}

REPLAY_TEST("A near trainer pic of STEVEN draws Steven's back pic")
{
    STREAM
    {
        SetTrainerPics(TRAINER_PIC_STEVEN, TRAINER_PIC_MAY);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        const struct ReplayTestTrainerSprite *trainer = ReplayTest_TrainerSpriteAtOpStart(1, REPLAY_SIDE_NEAR);

        EXPECT(trainer->inUse);
        EXPECT(trainer->images == GetTrainerBackPicImage(TRAINER_PIC_STEVEN));
        EXPECT_EQ(trainer->paletteTag, GetTrainerPicTag(TRAINER_PIC_STEVEN, FALSE));
    }
}

REPLAY_TEST("Replay_GetTrainerPic gives each side's pic while the replay is loaded")
{
    STREAM
    {
        SetTrainerPics(TRAINER_PIC_STEVEN, TRAINER_PIC_RED);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(Replay_GetTrainerPic(GetBattlerAtPosition(B_POSITION_PLAYER_LEFT), TRAINER_PIC_HIKER), TRAINER_PIC_STEVEN);
        EXPECT_EQ(Replay_GetTrainerPic(GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT), TRAINER_PIC_HIKER), TRAINER_PIC_RED);
    }
}

// Every other battle, the expansion's own tests among them, keeps the pic its controller picks.
TEST("Replay: Replay_GetTrainerPic gives the fallback with no replay loaded")
{
    Replay_Unload();
    EXPECT_EQ(Replay_GetTrainerPic(B_BATTLER_0, TRAINER_PIC_HIKER), TRAINER_PIC_HIKER);
    EXPECT_EQ(Replay_GetTrainerPic(B_BATTLER_1, TRAINER_PIC_LEAF), TRAINER_PIC_LEAF);
}

// A team size above the revealed mons gives the side unrevealed team members (#21): the intro's
// ball display reads each party slot's species, HP and status (battle_main.c), so each unrevealed
// member must hold a species, HP above 0 and no status to show as a ball.

static void SetTeamSize(u32 side, u32 teamSize)
{
    ReplayStream_SetU8(ReplayStream_TrainerOffset(side) + REPLAY_TRAINER_OFFSET_TEAM_SIZE, teamSize);
}

static bool32 ShowsAsBall(struct Pokemon *mon)
{
    u32 species = GetMonData(mon, MON_DATA_SPECIES_OR_EGG);

    return species != SPECIES_NONE
        && species != SPECIES_EGG
        && GetMonData(mon, MON_DATA_HP) != 0
        && GetMonData(mon, MON_DATA_STATUS) == 0;
}

REPLAY_TEST("A team size of 6 with one revealed mon gives five unrevealed members that show as balls")
{
    u32 slot;

    STREAM
    {
        SetTeamSize(REPLAY_SIDE_NEAR, 6);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        for (slot = 1; slot < PARTY_SIZE; slot++)
        {
            EXPECT(ShowsAsBall(&gParties[B_TRAINER_PLAYER][slot]));
            EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][slot], MON_DATA_SPECIES_OR_EGG), SPECIES_NONE);
        }
    }
}

REPLAY_TEST("A team size below the revealed mons keeps them all and adds none")
{
    u32 slot;

    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_DUGTRIO, 100);
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 2, SPECIES_MAGNETON, 100);
        SetTeamSize(REPLAY_SIDE_NEAR, 1);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_SPECIES), SPECIES_WOBBUFFET);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][1], MON_DATA_SPECIES), SPECIES_DUGTRIO);
        EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][2], MON_DATA_SPECIES), SPECIES_MAGNETON);
        for (slot = 3; slot < PARTY_SIZE; slot++)
            EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][slot], MON_DATA_SPECIES_OR_EGG), SPECIES_NONE);
    }
}

REPLAY_TEST("A team size above six fills the party and stops there")
{
    u32 slot;

    STREAM
    {
        SetTeamSize(REPLAY_SIDE_NEAR, 9);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        for (slot = 0; slot < PARTY_SIZE; slot++)
            EXPECT(ShowsAsBall(&gParties[B_TRAINER_PLAYER][slot]));
    }
}

// The personalities come from a generator of the replay's own (#103), so a mon's nature, and with
// it the back animation of a near mon, does not follow the shared generator's state when the
// replay starts. The generator starts from REPLAY_PERSONALITY_SEED, the seed of the fixed clock
// both engines boot with, and skips the draw SetSaveBlocksPointers takes at boot. A species of one
// gender or none, or a request of no gender, takes one draw.

static void WriteOneDrawTeams(void)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_MAGNEMITE, 100);
    ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 0) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_NONE);
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_TAUROS, 100);
    SetTeamSize(REPLAY_SIDE_NEAR, 3);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_CHANSEY, 100);
    ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_FEMALE);
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
}

// The fill order: the near side's mons by slot, then its unrevealed copy of slot 0, then the far
// side's mon. EXPECT_EQ reads its arguments again when it fails, so each draw is taken first.
static void ExpectOneDrawPersonalities(void)
{
    u32 i, personalities[4];
    rng_value_t rng = LocalRandomSeed(REPLAY_PERSONALITY_SEED);

    LocalRandom32(&rng);
    for (i = 0; i < ARRAY_COUNT(personalities); i++)
        personalities[i] = LocalRandom32(&rng);
    EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][0], MON_DATA_PERSONALITY), personalities[0]);
    EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][1], MON_DATA_PERSONALITY), personalities[1]);
    EXPECT_EQ(GetMonData(&gParties[B_TRAINER_PLAYER][2], MON_DATA_PERSONALITY), personalities[2]);
    EXPECT_EQ(GetMonData(&gParties[B_TRAINER_OPPONENT_A][0], MON_DATA_PERSONALITY), personalities[3]);
}

REPLAY_TEST("The personalities come from the replay's generator after one state of the shared one")
{
    STREAM
    {
        gRngValue = LocalRandomSeed(1);
        WriteOneDrawTeams();
    }
    THEN
    {
        ExpectOneDrawPersonalities();
    }
}

REPLAY_TEST("The personalities come from the replay's generator after another state of the shared one")
{
    STREAM
    {
        gRngValue = LocalRandomSeed(2);
        Random32();
        Random32();
        Random32();
        WriteOneDrawTeams();
    }
    THEN
    {
        ExpectOneDrawPersonalities();
    }
}

REPLAY_TEST("Each mon keeps the gender the team table names when its personality is drawn")
{
    STREAM
    {
        gRngValue = LocalRandomSeed(2);
        Random32();
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_WOBBUFFET, 100);
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 1) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_FEMALE);
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 2, SPECIES_MAGNEMITE, 100);
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_NEAR, 2) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_NONE);
        ReplayStream_SetU8(ReplayStream_MonOffset(REPLAY_SIDE_FAR, 0) + REPLAY_MON_OFFSET_GENDER, REPLAY_GENDER_FEMALE);
        ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_WOBBUFFET, 100);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(GetMonGender(&gParties[B_TRAINER_PLAYER][0]), MON_MALE);
        EXPECT_EQ(GetMonGender(&gParties[B_TRAINER_PLAYER][1]), MON_FEMALE);
        EXPECT_EQ(GetMonGender(&gParties[B_TRAINER_PLAYER][2]), MON_GENDERLESS);
        EXPECT_EQ(GetMonGender(&gParties[B_TRAINER_OPPONENT_A][0]), MON_FEMALE);
        EXPECT_EQ(GetMonGender(&gParties[B_TRAINER_OPPONENT_A][1]), MON_MALE);
    }
}
