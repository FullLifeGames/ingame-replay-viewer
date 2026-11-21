#include "global.h"
#include "replay_interpreter.h"
#include "replay_stream.h"
#include "constants/species.h"

// Reading an instruction stream (replay_stream.h) for the interpreter (#6). The stream may lie in
// ROM, so every read goes through a volatile pointer. replay_stream_check.c checks the stream
// before a battle starts.

u32 Replay_ReadU16(const volatile u8 *bytes)
{
    return bytes[0] | (bytes[1] << 8);
}

u32 Replay_ReadU32(const volatile u8 *bytes)
{
    return Replay_ReadU16(bytes) | (Replay_ReadU16(bytes + 2) << 16);
}

const volatile u8 *Replay_GetTrainer(const volatile u8 *stream, u32 side)
{
    return stream + REPLAY_STREAM_TRAINERS_OFFSET + side * REPLAY_TRAINER_SIZE;
}

const volatile u8 *Replay_GetMon(const volatile u8 *stream, u32 side, u32 slot)
{
    return stream + REPLAY_STREAM_MONS_OFFSET + (side * REPLAY_STREAM_PARTY_SIZE + slot) * REPLAY_MON_SIZE;
}

bool32 Replay_HoldsMon(const volatile u8 *stream, u32 side, u32 slot)
{
    return Replay_ReadU16(Replay_GetMon(stream, side, slot) + REPLAY_MON_OFFSET_SPECIES) != SPECIES_NONE;
}

