#ifndef GUARD_REPLAY_INTERPRETER_H
#define GUARD_REPLAY_INTERPRETER_H

#include "main.h"
#include "replay_progress.h"

// The ROM interpreter (#6): our stand-in for the battle engine. It plays an instruction stream
// (replay_stream.h) in a recorded link battle: BeginBattleIntro hands the battle main loop to it
// (patch 0001), and each frame it runs one step of the current instruction.

// Why the interpreter refuses a stream. It checks the whole stream before a battle starts.
// REPLAY_ERROR_ORDER stays last: the refusal texts (replay_refusal.c), their STATIC_ASSERT and
// their test count the codes up to it.
enum ReplayError
{
    REPLAY_ERROR_NONE,
    REPLAY_ERROR_EMPTY,   // a stream of no bytes, as in the replay slot of the built ROM
    REPLAY_ERROR_VERSION, // a stream version other than REPLAY_STREAM_VERSION
    REPLAY_ERROR_HEADER,  // a header size, table entry size or instruction span of another layout, or a replay slot header the ROM cannot read
    REPLAY_ERROR_OP,      // an op outside format v2
    REPLAY_ERROR_SIZE,    // a size byte other than the op's own
    REPLAY_ERROR_OVERRUN, // an instruction running past the end of the instructions
    REPLAY_ERROR_NO_END,  // the instructions do not end with their only END
    REPLAY_ERROR_OPERAND, // an operand outside its range, a party slot without a mon, or a PRINT text that is not glyphs and one EOS
    REPLAY_ERROR_TEAM,    // a trainer or team table entry outside its range, a trainer pic its side cannot draw, or a side without a mon
    REPLAY_ERROR_ORDER,   // an instruction that breaks the order rules (replay_stream.h)
};

// What the interpreter does after END. The ROM plays the outro (replay_outro.c) and then holds
// the black screen; the tests leave the battle through CB2_QuitRecordedBattle at once, or after
// the outro.
enum ReplayEnd
{
    REPLAY_OUTRO_THEN_HOLD,
    REPLAY_EXIT_AT_END,
    REPLAY_OUTRO_THEN_EXIT,
};

// How far the replay is. The tests read it, and the screenshot tool finds it by its symbol.
struct ReplayProgress
{
    u16 done;  // instructions finished
    u16 total; // instructions in the stream
    u16 turn;  // the number of the last TURN
    u8 error;  // enum ReplayError
    u8 finished;
    u8 playing; // the interpreter runs the battle: from the frame BeginBattleIntro hands it gBattleMainFunc
    u8 padding[3]; // the 12 bytes the GBA build's -mabi=apcs-gnu gives the struct, spelt out for the WebAssembly build
};

STATIC_ASSERT(offsetof(struct ReplayProgress, done) == REPLAY_PROGRESS_OFFSET_DONE, ReplayProgressDoneOffset);
STATIC_ASSERT(offsetof(struct ReplayProgress, total) == REPLAY_PROGRESS_OFFSET_TOTAL, ReplayProgressTotalOffset);
STATIC_ASSERT(offsetof(struct ReplayProgress, turn) == REPLAY_PROGRESS_OFFSET_TURN, ReplayProgressTurnOffset);
STATIC_ASSERT(offsetof(struct ReplayProgress, error) == REPLAY_PROGRESS_OFFSET_ERROR, ReplayProgressErrorOffset);
STATIC_ASSERT(offsetof(struct ReplayProgress, finished) == REPLAY_PROGRESS_OFFSET_FINISHED, ReplayProgressFinishedOffset);
STATIC_ASSERT(offsetof(struct ReplayProgress, playing) == REPLAY_PROGRESS_OFFSET_PLAYING, ReplayProgressPlayingOffset);
STATIC_ASSERT(sizeof(struct ReplayProgress) == REPLAY_PROGRESS_SIZE, ReplayProgressSize);

extern struct ReplayProgress gReplayProgress;

// The ROM's first callback (replay_boot.c, patch 0003): plays the stream in the replay slot.
void CB2_ReplayBoot(void);

// Checks a stream without playing it.
enum ReplayError Replay_Validate(const volatile u8 *stream, u32 length);

// Checks a stream and, if it plays, sets up the recorded battle and starts it with CB2_InitBattle.
// afterBattle runs when the battle has been left.
enum ReplayError Replay_Start(const volatile u8 *stream, u32 length, enum ReplayEnd end, MainCallback afterBattle);

// Called at the end of BeginBattleIntro (patch 0001): takes over gBattleMainFunc while a replay is
// loaded, and does nothing in any other battle.
void Replay_TakeOverBattleMain(void);

bool32 Replay_IsLoaded(void);

// Called by the recorded controllers when they draw a trainer (patch 0004): the stream's trainer
// pic of the battler's side while a replay is loaded, else fallback, so every other battle keeps
// its own pic.
u32 Replay_GetTrainerPic(u32 battler, u32 fallback);

// Called by UpdateHpTextInHealthbox (patch 0002): TRUE while a replay is loaded, so the near
// side's healthbox shows its HP bar without numbers, as the far side's does.
bool32 Replay_HidesHpNumbers(void);

#if TESTING
// Defined by the test runner (test/replay_test_runner.c): the interpreter calls it once it leaves
// the battle, after END or after the outro, while the battle is still up.
void ReplayTest_AtEnd(void);
// Called when op number op (counted from 0) starts, after every wait before it.
void ReplayTest_AtOpStart(u32 op);
// Called on the outro's first frame, the frame after END.
void ReplayTest_AtOutroStart(void);
#endif

// Forgets the loaded replay; gReplayProgress stays readable.
void Replay_Unload(void);

// For replay_setup.c: checks the stream and loads it into the interpreter.
enum ReplayError Replay_Load(const volatile u8 *stream, u32 length, enum ReplayEnd end);

// For the interpreter: Replay_Validate, which also counts the instructions (replay_stream_check.c).
enum ReplayError Replay_ValidateStream(const volatile u8 *stream, u32 length, u16 *count);

// Reads from a stream, which may lie in ROM (replay_stream.c). Numbers are little-endian.
u32 Replay_ReadU16(const volatile u8 *bytes);
u32 Replay_ReadU32(const volatile u8 *bytes);
const volatile u8 *Replay_GetTrainer(const volatile u8 *stream, u32 side);
const volatile u8 *Replay_GetMon(const volatile u8 *stream, u32 side, u32 slot);
bool32 Replay_HoldsMon(const volatile u8 *stream, u32 side, u32 slot);

#endif // GUARD_REPLAY_INTERPRETER_H
