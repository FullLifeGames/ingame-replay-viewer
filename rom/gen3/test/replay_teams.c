#include "global.h"
#include "battle.h"
#include "link.h"
#include "pokemon.h"
#include "test/replay_test.h"
#include "constants/global.h"
#include "constants/pokemon.h"
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
