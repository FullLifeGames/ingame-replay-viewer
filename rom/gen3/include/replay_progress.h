#ifndef GUARD_REPLAY_PROGRESS_H
#define GUARD_REPLAY_PROGRESS_H

// What the screenshot tool reads of a running ROM (#7): the byte offsets of struct ReplayProgress
// in gReplayProgress, which replay_interpreter.h checks beside the struct, and the backdrop of the
// refusal screen. Plain C with no game header, so rom/gen3/shot/replay_shot.c builds against it,
// and scripts/rom-shot-run.ts reads the REPLAY_PROGRESS_* and REPLAY_REFUSED_* defines below. Keep
// each value a plain number.

#define REPLAY_PROGRESS_OFFSET_DONE     0
#define REPLAY_PROGRESS_OFFSET_TOTAL    2
#define REPLAY_PROGRESS_OFFSET_TURN     4
#define REPLAY_PROGRESS_OFFSET_ERROR    6
#define REPLAY_PROGRESS_OFFSET_FINISHED 7
#define REPLAY_PROGRESS_SIZE            8

// The refusal screen (CB2_ReplayRefused in replay_boot.c) shows the backdrop RGB(REPLAY_REFUSED_RED, 0, 0).
#define REPLAY_REFUSED_RED 12

#endif // GUARD_REPLAY_PROGRESS_H
