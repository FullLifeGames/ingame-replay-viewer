#ifndef GUARD_REPLAY_INTERPRETER_H
#define GUARD_REPLAY_INTERPRETER_H

#include "main.h"

// The ROM interpreter (#6): our stand-in for the battle engine. It plays an instruction stream
// (replay_stream.h) in a recorded link battle: BeginBattleIntro hands the battle main loop to it
// (patch 0001), and each frame it runs one step of the current instruction.

// Why the interpreter refuses a stream. It checks the whole stream before a battle starts.
enum ReplayError
{
    REPLAY_ERROR_NONE,
    REPLAY_ERROR_EMPTY,   // a stream of no bytes, as in the replay slot of the built ROM
    REPLAY_ERROR_VERSION, // a stream version other than REPLAY_STREAM_VERSION
    REPLAY_ERROR_HEADER,  // a header size, table entry size or instruction span of another layout
    REPLAY_ERROR_OP,      // an op this interpreter does not play
    REPLAY_ERROR_SIZE,    // a size byte other than the op's own
    REPLAY_ERROR_OVERRUN, // an instruction running past the end of the instructions
    REPLAY_ERROR_NO_END,  // the instructions do not end with their only END
};

// What the interpreter does after END: the ROM holds the last scene, the tests leave the battle
// through CB2_QuitRecordedBattle.
enum ReplayEnd
{
    REPLAY_HOLD_AT_END,
    REPLAY_EXIT_AT_END,
};

// How far the replay is. The tests read it, and the screenshot tool finds it by its symbol.
struct ReplayProgress
{
    u16 done;  // instructions finished
    u16 total; // instructions in the stream
    u16 turn;  // the number of the last TURN
    u8 error;  // enum ReplayError
    u8 finished;
};

extern struct ReplayProgress gReplayProgress;

// Checks a stream without playing it.
enum ReplayError Replay_Validate(const volatile u8 *stream, u32 length);

// Checks a stream and, if it plays, sets up the recorded battle and starts it with CB2_InitBattle.
// afterBattle runs when the battle has been left.
enum ReplayError Replay_Start(const volatile u8 *stream, u32 length, enum ReplayEnd end, MainCallback afterBattle);

// Called at the end of BeginBattleIntro (patch 0001): takes over gBattleMainFunc while a replay is
// loaded, and does nothing in any other battle.
void Replay_TakeOverBattleMain(void);

bool32 Replay_IsLoaded(void);

// Forgets the loaded replay; gReplayProgress stays readable.
void Replay_Unload(void);

// For replay_setup.c: checks the stream and loads it into the interpreter.
enum ReplayError Replay_Load(const volatile u8 *stream, u32 length, enum ReplayEnd end);

// Little-endian reads from a stream, which may lie in ROM.
u32 Replay_ReadU16(const volatile u8 *bytes);
u32 Replay_ReadU32(const volatile u8 *bytes);

#endif // GUARD_REPLAY_INTERPRETER_H
