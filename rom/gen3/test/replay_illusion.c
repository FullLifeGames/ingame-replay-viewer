#include "global.h"
#include "battle.h"
#include "battle_util.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/species.h"

// Illusion (#98): the stream plays the battle log's disguise by its party slot, and the battle
// log's end of it as a WITHDRAW and a SWITCH_IN of the real mon. The game's own Illusion would
// pick a disguise of its own, the last alive party member (GetIllusionMonPartyId), so the mon a
// SEND_OUT or a SWITCH_IN puts on the field has it off. Zoroark's one ability is Illusion, and the
// mon behind it in the party would be its disguise.

REPLAY_TEST("A lead with Illusion that a SEND_OUT puts on the field shows no disguise")
{
    u32 nearBattler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);

    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_ZOROARK, 100);
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_STARMIE, 100);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(nearMon->species, SPECIES_ZOROARK);
        EXPECT_EQ(gBattleStruct->illusion[nearBattler].state, ILLUSION_OFF);
        EXPECT(GetIllusionMonPtr(nearBattler) == NULL);
    }
}

REPLAY_TEST("A mon with Illusion that a SWITCH_IN puts on the field shows no disguise")
{
    u32 farBattler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_FAR, 0, SPECIES_SKARMORY, 100);
        ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_ZOROARK, 100);
        ReplayStream_Mon(REPLAY_SIDE_FAR, 2, SPECIES_BLISSEY, 100);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_Withdraw(REPLAY_SIDE_FAR);
        ReplayStream_SwitchIn(REPLAY_SIDE_FAR, 1, 100, REPLAY_STATUS_NONE);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(farMon->species, SPECIES_ZOROARK);
        EXPECT_EQ(gBattleStruct->illusion[farBattler].state, ILLUSION_OFF);
        EXPECT(GetIllusionMonPtr(farBattler) == NULL);
    }
}
