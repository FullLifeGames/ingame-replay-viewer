#ifndef GUARD_REPLAY_TEST_H
#define GUARD_REPLAY_TEST_H

#include "test/battle.h"
#include "replay_interpreter.h"
#include "replay_stream.h"

// Tests of the ROM interpreter (#7) in the expansion's make check. A REPLAY_TEST writes an
// instruction stream in its STREAM block, queues the events it expects in SCENE with upstream's
// matchers (MESSAGE, HP_BAR, ANIMATION, ABILITY_POPUP, STATUS_ICON, EFFECTIVENESS_SE, NOT), and
// checks the battle in THEN after the stream has played, while the battle is still up:
//
//     REPLAY_TEST("TURN sets the turn")
//     {
//         STREAM { ReplayStream_Turn(3); ReplayStream_End(REPLAY_OUTCOME_NEAR_WON); }
//         THEN { EXPECT_EQ(gReplayProgress.turn, 3); }
//     }
//
// nearMon and farMon are the battle mons of the near and far side. Test names start with
// "Replay: ", so `npm run rom:check` runs them all with TESTS=Replay.

extern const struct TestRunner gReplayTestRunner;
extern bool8 gReplayTestRunStream;

#define REPLAY_TEST(_name) \
    static void CAT(Test, __LINE__)(void *, const u32, struct BattlePokemon *, struct BattlePokemon *); \
    __attribute__((section(".tests"), used)) static const struct Test CAT(sTest, __LINE__) = \
    { \
        .name = "Replay: " _name, \
        .filename = __FILE__, \
        .runner = &gReplayTestRunner, \
        .sourceLine = __LINE__, \
        .data = (void *)&(const struct BattleTest) \
        { \
            .type = BATTLE_TEST_SINGLES, \
            .function = { .singles = CAT(Test, __LINE__) }, \
        }, \
    }; \
    static void CAT(Test, __LINE__)(void *results, const u32 i, struct BattlePokemon *nearMon, struct BattlePokemon *farMon)

#define STREAM for (; gReplayTestRunStream; gReplayTestRunStream = FALSE)

// The KO animation counter (gBattleStruct->battlerKOAnimsRunning) when the interpreter started
// op number op of the stream, counted from 0. Recorded for the first REPLAY_TEST_RECORDED_OPS ops;
// a later op fails the test.
#define REPLAY_TEST_RECORDED_OPS 32
u32 ReplayTest_KOAnimsAtOpStart(u32 op);

// The trainer sprite of a side when the interpreter started op number op, recorded as the KO
// animation counter is. A SEND_OUT's ball throw frees the sprite, so a test reads it at the start
// of the first SEND_OUT, after INTRO drew both trainers.
struct ReplayTestTrainerSprite
{
    const struct SpriteFrameImage *images;
    u16 affineParam; // a front pic's trainer pic (BtlController_HandleDrawTrainerPic)
    u16 paletteTag;  // the tag of the palette the sprite draws with
    bool8 inUse;
};
const struct ReplayTestTrainerSprite *ReplayTest_TrainerSpriteAtOpStart(u32 op, u32 side);

// The animation turn of the last move animation (gAnimMoveTurn) when the interpreter started op
// number op, recorded as the KO animation counter is. At the start of the op after a MOVE it is
// the turn that MOVE's animation read.
u32 ReplayTest_AnimMoveTurnAtOpStart(u32 op);

// The type the move animations read (gBattleStruct->dynamicMoveType, TYPE_NONE for the move's
// own) when the interpreter started op number op, recorded as the KO animation counter is.
u32 ReplayTest_MoveTypeAtOpStart(u32 op);

// Whether the Tera indicator of a side (REPLAY_SIDE_*) was visible when the interpreter started op
// number op, recorded as the KO animation counter is.
bool32 ReplayTest_IndicatorShownAtOpStart(u32 op, u32 side);

// Called in STREAM: the interpreter plays the outro after END (REPLAY_OUTRO_THEN_EXIT), and THEN
// runs once the outro has faded the screen to black.
void ReplayTest_PlayOutro(void);

// The progress on the outro's first frame, the frame after END. All zero if no outro started.
const struct ReplayProgress *ReplayTest_ProgressAtOutroStart(void);

// Whether the low-HP beep (SE_LOW_HEALTH) plays now, and whether it played on the outro's first
// frame. The second is FALSE if no outro started.
bool32 ReplayTest_PlaysLowHpBeep(void);
bool32 ReplayTest_LowHpBeepAtOutroStart(void);

// Whether the mon of a side (REPLAY_SIDE_*) was visible when the outro sent it back into its
// ball. FALSE if no outro sent it back.
bool32 ReplayTest_VisibleAtReturn(u32 side);

// Called in STREAM: B is held on every frame the interpreter runs the battle, from the frame it
// takes over the battle to END, as a player who holds B through the whole replay.
void ReplayTest_HoldB(void);

// The stream writer (replay_stream_writer.c), a second encoder for the tests only.
// ReplayStream_Begin starts a stream with a trainer (BRENDAN near, MAY far) and one level 100
// Wobbuffet with 100 HP on each side; each op call appends one instruction and keeps the header's
// instruction length right.
void ReplayStream_Begin(void);
void ReplayStream_Trainer(u32 side, const u8 *name, u32 trainerPic);
// A level 100 male mon, not shiny, named as its species.
void ReplayStream_Mon(u32 side, u32 slot, u32 species, u32 maxHp);
void ReplayStream_End(u32 outcome);
void ReplayStream_Turn(u32 number);
// text is in the game's charset and ends with EOS, as COMPOUND_STRING("...") gives it.
void ReplayStream_Print(const u8 *text);
void ReplayStream_Intro(void);
void ReplayStream_SendOut(u32 side, u32 slot, u32 hp, u32 status);
// The MOVE has animation turn 0: the first script of a move animation that has two.
void ReplayStream_Move(u32 userSide, u32 targetSide, u32 move);
// The MOVE has the animation turn animTurn, which the game's move animation reads (gAnimMoveTurn).
void ReplayStream_MoveOnAnimTurn(u32 userSide, u32 targetSide, u32 move, u32 animTurn);
void ReplayStream_Hit(u32 side, u32 effectiveness);
void ReplayStream_Hp(u32 side, u32 hp);
void ReplayStream_Faint(u32 side);
void ReplayStream_Withdraw(u32 side);
void ReplayStream_SwitchIn(u32 side, u32 slot, u32 hp, u32 status);
void ReplayStream_Status(u32 side, u32 slot, u32 status);
// stages is the change, as Showdown's -boost and -unboost give it.
void ReplayStream_Stat(u32 side, u32 stat, s32 stages, u32 arrows);
void ReplayStream_Anim(u32 side, u32 anim);
void ReplayStream_Item(u32 side, u32 slot, u32 item);
void ReplayStream_ItemPopUp(u32 side, u32 item);
// move is the move that traps the side's mon.
void ReplayStream_TrapTurn(u32 side, u32 move);
void ReplayStream_FlushTextBox(void);
// species is the form the side's mon takes, such as SPECIES_CASTFORM_SUNNY.
void ReplayStream_FormChange(u32 side, u32 species);
// Shows the side's mon again, as the game shows a hidden Fly user whose hit turn plays no move.
void ReplayStream_ShowMon(u32 side);
// The side's mon Terastallizes into teraType (TYPE_*).
void ReplayStream_Tera(u32 side, u32 teraType);
// The next MOVE's animation plays as a move of type (TYPE_*), as Ivy Cudgel's and Tera Blast's do.
void ReplayStream_MoveType(u32 type);
void ReplayStream_Weather(u32 weather);
void ReplayStream_Volatile(u32 side, u32 volatileId, bool32 on);
// show: TRUE shows the ability pop-up, FALSE hides it.
void ReplayStream_Ability(u32 side, u32 ability, bool32 show);
// Any op with any size byte, for streams the interpreter must refuse.
void ReplayStream_Op(u32 op, u32 size, const u8 *operands);
// Overwrites stream bytes, for streams the interpreter must refuse.
void ReplayStream_SetU8(u32 offset, u32 value);
void ReplayStream_SetU16(u32 offset, u32 value);
void ReplayStream_SetU32(u32 offset, u32 value);
u32 ReplayStream_TrainerOffset(u32 side);
u32 ReplayStream_MonOffset(u32 side, u32 slot);
const u8 *ReplayStream_Data(void);
u32 ReplayStream_Length(void);

#endif // GUARD_REPLAY_TEST_H
