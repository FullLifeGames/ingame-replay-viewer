#ifndef GUARD_REPLAY_STATE_H
#define GUARD_REPLAY_STATE_H

// The video state dump of the shot tool, for the mGBA oracle of our platform layer (#43, plan B3;
// scripts/wasm-oracle.ts reads it). replay_state.c holds the format.

#include <stdbool.h>

struct mCore;

// Takes mGBA's save state and writes <dir>/state-<frame>.bin. False when it cannot.
bool WriteVideoState(struct mCore *core, const char *dir, unsigned long frame);

#endif // GUARD_REPLAY_STATE_H
