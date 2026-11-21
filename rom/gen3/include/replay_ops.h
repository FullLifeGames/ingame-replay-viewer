#ifndef GUARD_REPLAY_OPS_H
#define GUARD_REPLAY_OPS_H

// The step functions of the ROM interpreter's ops (replay_interpreter.c) that live in files of
// their own, and what they share with it. A step function plays one step of its op and returns
// TRUE when the op is done; the interpreter calls the next step once no controller is busy and no
// wait runs.

typedef bool32 (*ReplayOpFunc)(const volatile u8 *operands, u32 step);

// The battler of a REPLAY_SIDE_*.
u32 Replay_GetBattler(u32 side);

// Waits this many frames before the op's next step.
void Replay_Wait(u32 frames);

// replay_ops_damage.c
bool32 Replay_OpMove(const volatile u8 *operands, u32 step);
bool32 Replay_OpHit(const volatile u8 *operands, u32 step);
bool32 Replay_OpHp(const volatile u8 *operands, u32 step);
bool32 Replay_OpFaint(const volatile u8 *operands, u32 step);

#endif // GUARD_REPLAY_OPS_H
