#include "global.h"
#include "test/test.h"
#include "test/replay_test.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/species.h"

// The interpreter refuses a stream that breaks the order rules (replay_stream.h, #18) before a
// battle starts. src/gen3/stream/order.test.ts holds the same cases by name, with the same ops and
// the same verdict, and fails when the two lists differ.

static enum ReplayError Validate(void)
{
    return Replay_Validate(ReplayStream_Data(), ReplayStream_Length());
}

TEST("Replay: order: a MOVE before any SEND_OUT is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_POUND);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a SEND_OUT before INTRO is refused")
{
    ReplayStream_Begin();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: an INTRO after the first instruction is refused")
{
    ReplayStream_Begin();
    ReplayStream_Turn(1);
    ReplayStream_Intro();
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a second INTRO is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_Intro();
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a second SEND_OUT of the near side is refused")
{
    ReplayStream_Begin();
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a SWITCH_IN while the battler is out is refused")
{
    ReplayStream_Begin();
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a SWITCH_IN of a side never sent out is refused")
{
    ReplayStream_Begin();
    ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SwitchIn(REPLAY_SIDE_FAR, 1, 100, REPLAY_STATUS_NONE);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: HP of a side whose battler fainted is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Faint(REPLAY_SIDE_FAR);
    ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a FAINT twice is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Faint(REPLAY_SIDE_FAR);
    ReplayStream_Faint(REPLAY_SIDE_FAR);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a MOVE at a fainted target is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Faint(REPLAY_SIDE_FAR);
    ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_POUND);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a status ANIM after a WITHDRAW is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
    ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_STATUS_PSN);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a FORM_CHANGE after a WITHDRAW is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Withdraw(REPLAY_SIDE_FAR);
    ReplayStream_FormChange(REPLAY_SIDE_FAR, SPECIES_CASTFORM_SUNNY);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

TEST("Replay: order: a SHOW_MON after a WITHDRAW is refused")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
    ReplayStream_ShowMon(REPLAY_SIDE_NEAR);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_ORDER);
}

// Explosion in sand: both battlers faint, the game still plays the sandstorm at the end of the
// turn, then both sides send in their next mon.
TEST("Replay: order: a double KO in sand, the sand upkeep and both switch-ins pass")
{
    ReplayStream_Begin();
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Weather(REPLAY_WEATHER_SAND);
    ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_EXPLOSION);
    ReplayStream_Faint(REPLAY_SIDE_FAR);
    ReplayStream_Faint(REPLAY_SIDE_NEAR);
    ReplayStream_Anim(REPLAY_SIDE_NEAR, REPLAY_ANIM_SANDSTORM_CONTINUES);
    ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
    ReplayStream_SwitchIn(REPLAY_SIDE_FAR, 1, 100, REPLAY_STATUS_NONE);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

TEST("Replay: order: a WITHDRAW, then a SWITCH_IN and a MOVE pass")
{
    ReplayStream_Begin();
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Withdraw(REPLAY_SIDE_NEAR);
    ReplayStream_SwitchIn(REPLAY_SIDE_NEAR, 1, 100, REPLAY_STATUS_NONE);
    ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_POUND);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

TEST("Replay: order: a FORM_CHANGE of a battler on the field passes")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_FormChange(REPLAY_SIDE_NEAR, SPECIES_CASTFORM_SUNNY);
    ReplayStream_FormChange(REPLAY_SIDE_FAR, SPECIES_CASTFORM_SUNNY);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

TEST("Replay: order: a SHOW_MON of a battler on the field passes")
{
    ReplayStream_Begin();
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_ShowMon(REPLAY_SIDE_NEAR);
    ReplayStream_ShowMon(REPLAY_SIDE_FAR);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

// STATUS and ITEM name a party slot, so they reach a benched mon too (Heal Bell).
TEST("Replay: order: a STATUS and an ITEM of a benched slot pass")
{
    ReplayStream_Begin();
    ReplayStream_Mon(REPLAY_SIDE_FAR, 1, SPECIES_WOBBUFFET, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Status(REPLAY_SIDE_FAR, 1, REPLAY_STATUS_SLP);
    ReplayStream_Item(REPLAY_SIDE_FAR, 1, ITEM_MASTER_BALL);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

TEST("Replay: order: a WEATHER with no INTRO passes")
{
    ReplayStream_Begin();
    ReplayStream_Weather(REPLAY_WEATHER_RAIN);
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}

TEST("Replay: order: TURN and PRINT with no INTRO pass")
{
    ReplayStream_Begin();
    ReplayStream_Turn(1);
    ReplayStream_Print(COMPOUND_STRING("Hi"));
    ReplayStream_End(REPLAY_OUTCOME_TIE);
    EXPECT_EQ(Validate(), REPLAY_ERROR_NONE);
}
