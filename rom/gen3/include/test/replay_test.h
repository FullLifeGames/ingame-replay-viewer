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
void ReplayStream_Move(u32 userSide, u32 targetSide, u32 move);
void ReplayStream_Hit(u32 side, u32 effectiveness);
void ReplayStream_Hp(u32 side, u32 hp);
void ReplayStream_Faint(u32 side);
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
