#ifndef GUARD_REPLAY_SLOT_H
#define GUARD_REPLAY_SLOT_H

// The replay slot (ADR 0008): a fixed-size, aligned, zero-filled area in ROM. The page writes an
// instruction stream into it after patching. scripts/rom-slot.ts reads the REPLAY_SLOT_* defines
// below, so this header is the one source of the layout. Keep each value a plain number or string.

#define REPLAY_SLOT_MAGIC        "IRV_SLOT"
#define REPLAY_SLOT_MAGIC_LENGTH 8
#define REPLAY_SLOT_VERSION      1
#define REPLAY_SLOT_HEADER_SIZE  0x20
#define REPLAY_SLOT_SIZE         0x20000
#define REPLAY_SLOT_ALIGNMENT    0x1000

// Byte offsets of the header fields, all little-endian.
#define REPLAY_SLOT_OFFSET_VERSION       0x08
#define REPLAY_SLOT_OFFSET_HEADER_SIZE   0x0A
#define REPLAY_SLOT_OFFSET_SLOT_SIZE     0x0C
#define REPLAY_SLOT_OFFSET_STREAM_LENGTH 0x10
#define REPLAY_SLOT_OFFSET_RESERVED      0x14

struct ReplaySlotHeader
{
    u8 magic[REPLAY_SLOT_MAGIC_LENGTH]; // REPLAY_SLOT_MAGIC, without a terminating zero
    u16 slotVersion;
    u16 headerSize;
    u32 slotSize;
    u32 streamLength; // 0 in the built ROM; the page writes the length of its stream.
    u8 reserved[REPLAY_SLOT_HEADER_SIZE - REPLAY_SLOT_OFFSET_RESERVED];
};

struct ReplaySlot
{
    struct ReplaySlotHeader header;
    u8 stream[REPLAY_SLOT_SIZE - REPLAY_SLOT_HEADER_SIZE]; // starts with the stream's own version
};

// The build leaves the slot zero-filled and the page fills it in the ROM image, so the compiler
// knows contents that are wrong at run time and, with LTO, could fold reads of them across files.
// Read the slot only through a pointer to const volatile data:
//     const volatile struct ReplaySlot *slot = &gReplaySlot;
extern const struct ReplaySlot gReplaySlot;

#endif // GUARD_REPLAY_SLOT_H
