// replay_shot: plays a built ROM in headless mGBA (libmgba 0.10) and writes frames at named points
// of the replay (#7, plan section 7). scripts/rom-shot.ts builds it, writes the stream into the
// ROM's replay slot, runs it and checks the frames. It is a host program: the build never copies
// it into the expansion's tree.
//
//     replay_shot <rom> <progress address> <frame dir> [--state-every <n>] [<name>:<done>:<frames> ...]
//
// It loads the ROM with no save file and no BIOS file, so mGBA keeps the save in memory and runs
// its own BIOS, and runs frames as fast as it can. After each frame it reads gReplayProgress
// (rom/gen3/include/replay_interpreter.h) at the given address. A shot <name>:<done>:<frames> is
// taken <frames> frames after the first frame on which the interpreter plays and `done` equals
// <done>, and goes to
// <frame dir>/<name>.ppm (binary PPM, 240x160). The run stops when the replay has finished and no
// shot it reached is still due, ERROR_FRAMES frames after the interpreter reports an error (so the
// refusal screen is up), or when `done` has not changed for STALL_FRAMES frames: the viewer presses
// no button, so an op that waits for one stalls. The frame it stops on goes to
// <frame dir>/final.ppm.
//
// With --state-every <n> (the mGBA oracle of the WebAssembly build, #43) it also writes, on each
// frame that is a multiple of n, the video state as <frame dir>/state-<frame>.bin
// (replay_state.c) and the frame as frame-<frame>.ppm, and the frame after it as
// frame-<frame + 1>.ppm, so the oracle can tell which frame a state belongs to. The probe of
// #43's step B3 found that a state belongs to the frame of its own number: runFrame returns
// after line 159 and before the game's VBlank handler runs (42 of 48 states of hand-made and 585
// of 660 of 994052 equal their own frame, 21 and 334 the next one, and DMA0's internal source
// stands 160 units past the SAD the game wrote).
//
// Output on stdout, one JSON object per line: {"shot":...} for each shot, then {"status":...}.
// Exit code 0 when the run reached a status, 2 on a usage or emulator error.

#include <mgba/core/blip_buf.h>
#include <mgba/core/core.h>
#include <mgba/core/interface.h>
#include <mgba/core/log.h>

#include <errno.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// The offsets of struct ReplayProgress, which the ROM checks against the struct. scripts/rom-shot.ts
// checks the symbol's size against REPLAY_PROGRESS_SIZE before it runs this tool.
#include "replay_progress.h"
#include "replay_state.h"

#define STALL_FRAMES 3600
#define ERROR_FRAMES 30
#define MAX_SHOTS 64
#define MAX_NAME 32


struct Progress
{
    unsigned done;
    unsigned total;
    unsigned turn;
    unsigned error;
    bool finished;
    bool playing;
};

struct Shot
{
    char name[MAX_NAME];
    unsigned done;
    unsigned frames;
    bool armed;
    bool taken;
    unsigned long due;
};

struct Run
{
    struct mCore *core;
    color_t *pixels;
    unsigned width;
    unsigned height;
    uint32_t progressAddress;
    const char *frameDir;
    struct Shot shots[MAX_SHOTS];
    int shotCount;
    unsigned long stateEvery;
};

// mGBA logs every DMA and BIOS call by default; only its errors reach stderr here.
static void LogErrors(struct mLogger *logger, int category, enum mLogLevel level, const char *format, va_list args)
{
    (void)logger;
    if (!(level & (mLOG_FATAL | mLOG_ERROR)))
        return;
    fprintf(stderr, "mGBA %s: ", mLogCategoryName(category));
    vfprintf(stderr, format, args);
    fputc('\n', stderr);
}

static struct mLogger sLogger = { .log = LogErrors };

static int Fail(const char *message, const char *detail)
{
    fprintf(stderr, "replay_shot: %s%s%s\n", message, detail ? ": " : "", detail ? detail : "");
    return 2;
}

static bool ParseShot(const char *text, struct Shot *shot)
{
    const char *colon = strchr(text, ':');
    size_t length = colon ? (size_t)(colon - text) : 0;
    char *end;
    unsigned long done, frames;

    if (length == 0 || length >= MAX_NAME || strspn(text, "abcdefghijklmnopqrstuvwxyz0123456789-") != length)
        return false;
    errno = 0;
    done = strtoul(colon + 1, &end, 10);
    if (errno != 0 || end == colon + 1 || *end != ':' || done > UINT16_MAX)
        return false;
    frames = strtoul(end + 1, &end, 10);
    if (errno != 0 || *end != '\0' || frames > STALL_FRAMES)
        return false;
    memcpy(shot->name, text, length);
    shot->name[length] = '\0';
    shot->done = (unsigned)done;
    shot->frames = (unsigned)frames;
    return true;
}

static struct Progress ReadProgress(struct Run *run)
{
    struct mCore *core = run->core;
    uint32_t at = run->progressAddress;
    struct Progress progress;

    progress.done = core->busRead16(core, at + REPLAY_PROGRESS_OFFSET_DONE);
    progress.total = core->busRead16(core, at + REPLAY_PROGRESS_OFFSET_TOTAL);
    progress.turn = core->busRead16(core, at + REPLAY_PROGRESS_OFFSET_TURN);
    progress.error = core->busRead8(core, at + REPLAY_PROGRESS_OFFSET_ERROR);
    progress.finished = core->busRead8(core, at + REPLAY_PROGRESS_OFFSET_FINISHED) != 0;
    progress.playing = core->busRead8(core, at + REPLAY_PROGRESS_OFFSET_PLAYING) != 0;
    return progress;
}

// mGBA's colour is XBGR8: red in the low byte.
static bool WriteFrame(struct Run *run, const char *name)
{
    char path[4096];
    FILE *file;
    unsigned i, count = run->width * run->height;
    bool ok;

    snprintf(path, sizeof(path), "%s/%s.ppm", run->frameDir, name);
    file = fopen(path, "wb");
    if (!file)
        return false;
    fprintf(file, "P6\n%u %u\n255\n", run->width, run->height);
    for (i = 0; i < count; i++)
    {
        color_t pixel = run->pixels[i];
        unsigned char rgb[3] = { pixel & 0xFF, (pixel >> 8) & 0xFF, (pixel >> 16) & 0xFF };
        fwrite(rgb, 1, sizeof(rgb), file);
    }
    ok = !ferror(file);
    return fclose(file) == 0 && ok;
}

// Arms each shot on the first frame its `done` is reached while the interpreter plays (so a shot at
// done 0 starts with the battle, not with the boot) and writes it when its frames are up. Returns
// false when a frame could not be written.
static bool TakeShots(struct Run *run, struct Progress progress, unsigned long frame)
{
    int i;

    for (i = 0; i < run->shotCount; i++)
    {
        struct Shot *shot = &run->shots[i];

        if (!shot->armed && progress.playing && progress.done == shot->done)
        {
            shot->armed = true;
            shot->due = frame + shot->frames;
        }
        if (!shot->armed || shot->taken || frame != shot->due)
            continue;
        if (!WriteFrame(run, shot->name))
            return false;
        shot->taken = true;
        printf("{\"shot\":\"%s\",\"frame\":%lu,\"done\":%u}\n", shot->name, frame, progress.done);
    }
    return true;
}

static bool ShotsDue(const struct Run *run)
{
    int i;

    for (i = 0; i < run->shotCount; i++)
    {
        if (run->shots[i].armed && !run->shots[i].taken)
            return true;
    }
    return false;
}

// The sound goes nowhere; emptying its buffers keeps them from filling up.
static void DropAudio(struct mCore *core)
{
    blip_clear(core->getAudioChannel(core, 0));
    blip_clear(core->getAudioChannel(core, 1));
}

// The oracle's dump: the state and the frame on each multiple of stateEvery, and the frame after.
static bool DumpState(struct Run *run, unsigned long frame)
{
    char name[MAX_NAME];

    if (run->stateEvery == 0 || (run->stateEvery > 1 && frame % run->stateEvery > 1))
        return true;
    if (frame % run->stateEvery == 0 && !WriteVideoState(run->core, run->frameDir, frame))
        return false;
    snprintf(name, sizeof(name), "frame-%lu", frame);
    return WriteFrame(run, name);
}

static const char *Play(struct Run *run, unsigned long *frame, struct Progress *progress)
{
    unsigned lastDone = 0;
    unsigned long lastChange = 0, errorFrame = 0;

    for (*frame = 1;; (*frame)++)
    {
        run->core->runFrame(run->core);
        DropAudio(run->core);
        if (!DumpState(run, *frame))
            return NULL;
        *progress = ReadProgress(run);
        if (!TakeShots(run, *progress, *frame))
            return NULL;
        if (progress->error != 0 && errorFrame == 0)
            errorFrame = *frame;
        if (errorFrame != 0 && *frame - errorFrame >= ERROR_FRAMES)
            return "error";
        if (progress->finished && !ShotsDue(run))
            return "finished";
        if (progress->done != lastDone)
        {
            lastDone = progress->done;
            lastChange = *frame;
        }
        if (*frame - lastChange >= STALL_FRAMES)
            return "stall";
    }
}

static int ParseArgs(struct Run *run, int argc, char **argv)
{
    char *end;
    int i;

    if (argc < 4)
        return Fail("usage: replay_shot <rom> <progress address> <frame dir> [--state-every <n>] [<name>:<done>:<frames> ...]", NULL);
    errno = 0;
    run->progressAddress = (uint32_t)strtoul(argv[2], &end, 0);
    if (errno != 0 || *end != '\0' || run->progressAddress == 0)
        return Fail("not an address", argv[2]);
    run->frameDir = argv[3];
    i = 4;
    if (argc > 5 && strcmp(argv[4], "--state-every") == 0)
    {
        errno = 0;
        run->stateEvery = strtoul(argv[5], &end, 10);
        if (errno != 0 || *end != '\0' || run->stateEvery == 0)
            return Fail("not a frame count", argv[5]);
        i = 6;
    }
    if (argc - i > MAX_SHOTS)
        return Fail("too many shots", NULL);
    for (; i < argc; i++)
    {
        if (!ParseShot(argv[i], &run->shots[run->shotCount++]))
            return Fail("not a shot <name>:<done>:<frames>", argv[i]);
    }
    return 0;
}

static int StartCore(struct Run *run, const char *romPath)
{
    struct mCore *core;

    mLogSetDefaultLogger(&sLogger);
    core = mCoreFind(romPath);
    if (!core)
        return Fail("no emulator core for", romPath);
    run->core = core;
    if (!core->init(core))
        return Fail("the core does not start", NULL);
    mCoreInitConfig(core, NULL);
    core->desiredVideoDimensions(core, &run->width, &run->height);
    run->pixels = calloc((size_t)run->width * run->height, BYTES_PER_PIXEL);
    if (!run->pixels)
        return Fail("out of memory", NULL);
    core->setVideoBuffer(core, run->pixels, run->width);
    if (!mCoreLoadFile(core, romPath))
        return Fail("cannot load", romPath);
    core->reset(core);
    return 0;
}

int main(int argc, char **argv)
{
    static struct Run run;
    struct Progress progress = { 0 };
    unsigned long frame = 0;
    const char *status;
    int result = ParseArgs(&run, argc, argv);

    if (result == 0)
        result = StartCore(&run, argv[1]);
    if (result != 0)
        return result;
    status = Play(&run, &frame, &progress);
    if (!status || !WriteFrame(&run, "final"))
        return Fail("cannot write a frame into", run.frameDir);
    printf("{\"status\":\"%s\",\"frame\":%lu,\"done\":%u,\"total\":%u,\"turn\":%u,\"error\":%u}\n",
           status, frame, progress.done, progress.total, progress.turn, progress.error);
    run.core->deinit(run.core);
    free(run.pixels);
    return 0;
}
