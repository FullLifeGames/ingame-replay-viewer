#include "global.h"
#include "battle.h"
#include "link.h"
#include "pokemon.h"
#include "test/replay_test.h"
#include "constants/global.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/trainers.h"

// The battle's trainers and teams come from the stream's tables (#6): each mon's gender and
// shininess, and each link player's gender, from which the recorded controllers pick the
// trainer pic (BRENDAN for male, MAY for female).

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
        SetTrainerPics(TRAINER_PIC_HIKER, TRAINER_PIC_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(gLinkPlayers[REPLAY_SIDE_NEAR].gender, MALE);
        EXPECT_EQ(gLinkPlayers[REPLAY_SIDE_FAR].gender, FEMALE);
    }
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
