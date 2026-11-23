#ifndef GUARD_REPLAY_REFUSAL_H
#define GUARD_REPLAY_REFUSAL_H

#include "replay_interpreter.h"

// The refusal screen (#30): when the ROM refuses its replay slot or the stream in it, the screen
// names the reason in text on the refusal backdrop (replay_progress.h) and keeps it.

// The text window in tiles. The text of every refused code fits it (test/replay_refusal.c).
#define REPLAY_REFUSAL_WINDOW_WIDTH  26
#define REPLAY_REFUSAL_WINDOW_HEIGHT 12

// A buffer of this size holds the screen's whole text with its EOS.
#define REPLAY_REFUSAL_TEXT_SIZE 160

// Writes the screen's text for error into dest: a header line, the reason of the code and
// "Error N", N the code's number in enum ReplayError.
void Replay_FormatRefusal(enum ReplayError error, u8 *dest);

// Draws the refusal screen of error on a plain screen, with the calls of the expansion's
// CB2_FlashNotDetectedScreen. Called once, with no VBlank callback set.
void Replay_ShowRefusal(enum ReplayError error);

#endif // GUARD_REPLAY_REFUSAL_H
