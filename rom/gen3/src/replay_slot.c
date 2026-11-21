#include "global.h"
#include "replay_slot.h"

// The replay slot (ADR 0008). KEEP_SECTION puts it into .text.consts, which both linker scripts
// keep, so --gc-sections leaves it in the ROM although no code reads it yet.

STATIC_ASSERT(sizeof(REPLAY_SLOT_MAGIC) == REPLAY_SLOT_MAGIC_LENGTH + 1, ReplaySlotMagicLength);
STATIC_ASSERT(offsetof(struct ReplaySlotHeader, slotVersion) == REPLAY_SLOT_OFFSET_VERSION, ReplaySlotVersionOffset);
STATIC_ASSERT(offsetof(struct ReplaySlotHeader, headerSize) == REPLAY_SLOT_OFFSET_HEADER_SIZE, ReplaySlotHeaderSizeOffset);
STATIC_ASSERT(offsetof(struct ReplaySlotHeader, slotSize) == REPLAY_SLOT_OFFSET_SLOT_SIZE, ReplaySlotSlotSizeOffset);
STATIC_ASSERT(offsetof(struct ReplaySlotHeader, streamLength) == REPLAY_SLOT_OFFSET_STREAM_LENGTH, ReplaySlotStreamLengthOffset);
STATIC_ASSERT(offsetof(struct ReplaySlotHeader, reserved) == REPLAY_SLOT_OFFSET_RESERVED, ReplaySlotReservedOffset);
STATIC_ASSERT(sizeof(struct ReplaySlotHeader) == REPLAY_SLOT_HEADER_SIZE, ReplaySlotHeaderSize);
STATIC_ASSERT(sizeof(struct ReplaySlot) == REPLAY_SLOT_SIZE, ReplaySlotSize);
STATIC_ASSERT(REPLAY_SLOT_SIZE % REPLAY_SLOT_ALIGNMENT == 0, ReplaySlotSizeAligned);

KEEP_SECTION USED ALIGNED(REPLAY_SLOT_ALIGNMENT) const struct ReplaySlot gReplaySlot =
{
    .header =
    {
        .magic = REPLAY_SLOT_MAGIC,
        .slotVersion = REPLAY_SLOT_VERSION,
        .headerSize = REPLAY_SLOT_HEADER_SIZE,
        .slotSize = REPLAY_SLOT_SIZE,
        .streamLength = 0,
    },
};
