// The video state dump of the shot tool, for the mGBA oracle of our platform layer (#43, plan B3).
// After a frame it takes mGBA's save state through the core's own interface and writes the parts
// the display reads, so scripts/wasm-oracle.ts can draw the same instant with our renderer and
// compare it with mGBA's frame. It reads the state by the field names of libmgba's installed
// serialize.h only.
//
// <dir>/state-<frame>.bin, little-endian words, then the areas as mGBA keeps them:
//     magic "IRVS", version 1, frame, flags (bit 0: EWRAM follows)
//     DMA0's internal source, destination and count
//     IO 0x400, palette RAM 0x400, VRAM 0x18000, OAM 0x400, [EWRAM 0x40000]
// EWRAM comes only while DMA0 runs at HBlank (DMA0CNT_H enabled with start timing 2), the
// scanline effects of the battle, whose source tables the oracle then replays.

#include <mgba/core/core.h>
#include <mgba/internal/gba/serialize.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "replay_state.h"

#define STATE_MAGIC   0x53565249
#define STATE_VERSION 1
#define STATE_EWRAM   1

// GBATEK "GBA DMA Transfers": DMA0CNT_H at 0x040000BA, enable bit 15, start timing in bits 12-13.
#define REG_DMA0CNT_H     0xBA
#define DMA_ENABLE        0x8000
#define DMA_TIMING_SHIFT  12
#define DMA_TIMING_HBLANK 2

static bool HBlankDma0(const struct GBASerializedState *state)
{
    uint16_t control = state->io[REG_DMA0CNT_H >> 1];

    return (control & DMA_ENABLE) && ((control >> DMA_TIMING_SHIFT) & 3) == DMA_TIMING_HBLANK;
}

static bool WriteState(FILE *file, const struct GBASerializedState *state, unsigned long frame)
{
    bool ewram = HBlankDma0(state);
    uint32_t header[7] = {
        STATE_MAGIC, STATE_VERSION, (uint32_t)frame, ewram ? STATE_EWRAM : 0,
        state->dma[0].nextSource, state->dma[0].nextDest, (uint32_t)state->dma[0].nextCount,
    };

    fwrite(header, sizeof(header), 1, file);
    fwrite(state->io, sizeof(state->io), 1, file);
    fwrite(state->pram, sizeof(state->pram), 1, file);
    fwrite(state->vram, sizeof(state->vram), 1, file);
    fwrite(state->oam, sizeof(state->oam), 1, file);
    if (ewram)
        fwrite(state->wram, sizeof(state->wram), 1, file);
    return !ferror(file);
}

bool WriteVideoState(struct mCore *core, const char *dir, unsigned long frame)
{
    static void *sState;
    static size_t sSize;
    char path[4096];
    FILE *file;
    bool ok;

    if (sState == NULL)
    {
        sSize = core->stateSize(core);
        if (sSize < sizeof(struct GBASerializedState) || (sState = malloc(sSize)) == NULL)
            return false;
    }
    if (!core->saveState(core, sState))
        return false;
    snprintf(path, sizeof(path), "%s/state-%lu.bin", dir, frame);
    file = fopen(path, "wb");
    if (file == NULL)
        return false;
    ok = WriteState(file, sState, frame);
    return fclose(file) == 0 && ok;
}
