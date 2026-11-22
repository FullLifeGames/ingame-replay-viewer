// The host harness of our platform layer (#43): a native program that runs one call of the layer
// per run, for the specs (scripts/wasm-layer.ts). Never part of the module.
//   irv_layer_host <command> <input> <output>
// The input holds little-endian words: the argument count and the arguments, the source's length
// and bytes, the destination's length and bytes. The output holds the result word and the
// destination after the call.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "irv_bios.h"
#include "irv_sine.h"

#define MAX_ARGS 8

struct HostCall
{
    uint32_t argc;
    uint32_t args[MAX_ARGS];
    uint8_t *src;
    uint8_t *dest;
    uint32_t destLength;
    uint32_t result;
};

static void Fail(const char *what)
{
    fprintf(stderr, "irv_layer_host: %s\n", what);
    exit(2);
}

static uint8_t *ReadFile(const char *path, size_t *length)
{
    FILE *file = fopen(path, "rb");
    uint8_t *bytes;
    long size;

    if (file == NULL || fseek(file, 0, SEEK_END) != 0 || (size = ftell(file)) < 0)
        Fail("cannot read the input");
    rewind(file);
    bytes = malloc(size + 1);
    if (bytes == NULL || fread(bytes, 1, size, file) != (size_t)size)
        Fail("cannot read the input");
    fclose(file);
    *length = size;
    return bytes;
}

struct Reader
{
    const uint8_t *at;
    size_t left;
};

static uint32_t TakeWord(struct Reader *reader)
{
    uint32_t value;

    if (reader->left < 4)
        Fail("the input ends inside a word");
    value = reader->at[0] | (reader->at[1] << 8) | (reader->at[2] << 16) | ((uint32_t)reader->at[3] << 24);
    reader->at += 4;
    reader->left -= 4;
    return value;
}

// A block of the input in its own word-aligned buffer, as the BIOS calls expect their pointers.
static uint8_t *TakeBlock(struct Reader *reader, uint32_t *length)
{
    uint8_t *block;

    *length = TakeWord(reader);
    if (reader->left < *length)
        Fail("the input ends inside a block");
    block = aligned_alloc(16, (*length + 16) & ~15u);
    if (block == NULL)
        Fail("out of memory");
    memcpy(block, reader->at, *length);
    reader->at += *length;
    reader->left -= *length;
    return block;
}

static void ParseCall(const uint8_t *bytes, size_t length, struct HostCall *call)
{
    struct Reader reader = {bytes, length};
    uint32_t srcLength, i;

    call->argc = TakeWord(&reader);
    if (call->argc > MAX_ARGS)
        Fail("more than 8 arguments");
    for (i = 0; i < call->argc; i++)
        call->args[i] = TakeWord(&reader);
    call->src = TakeBlock(&reader, &srcLength);
    call->dest = TakeBlock(&reader, &call->destLength);
    if (reader.left != 0)
        Fail("the input has bytes after the destination");
}

static void RunCpuSet(struct HostCall *call)
{
    CpuSet(call->src, call->dest, call->args[0]);
}

static void RunCpuFastSet(struct HostCall *call)
{
    CpuFastSet(call->src, call->dest, call->args[0]);
}

static void RunLz77Wram(struct HostCall *call)
{
    LZ77UnCompWram((const uint32_t *)call->src, call->dest);
}

static void RunLz77Vram(struct HostCall *call)
{
    LZ77UnCompVram((const uint32_t *)call->src, call->dest);
}

static void RunSqrt(struct HostCall *call)
{
    call->result = Sqrt(call->args[0]);
}

static void RunArcTan2(struct HostCall *call)
{
    call->result = ArcTan2((int16_t)call->args[0], (int16_t)call->args[1]);
}

static void RunSine(struct HostCall *call)
{
    if (call->destLength != sizeof(gIrvSineQuarter))
        Fail("sine takes a destination of the table's size");
    memcpy(call->dest, gIrvSineQuarter, sizeof(gIrvSineQuarter));
}

static void RunBgAffine(struct HostCall *call)
{
    BgAffineSet((struct IrvBgAffineSource *)call->src, (struct IrvBgAffineDest *)call->dest, call->args[0]);
}

static void RunObjAffine(struct HostCall *call)
{
    ObjAffineSet((struct IrvObjAffineSource *)call->src, call->dest, call->args[0], call->args[1]);
}

struct Command
{
    const char *name;
    uint32_t argc;
    void (*run)(struct HostCall *call);
};

static const struct Command sCommands[] = {
    {"cpuset", 1, RunCpuSet},
    {"cpufastset", 1, RunCpuFastSet},
    {"lz77w", 0, RunLz77Wram},
    {"lz77v", 0, RunLz77Vram},
    {"sqrt", 1, RunSqrt},
    {"arctan2", 2, RunArcTan2},
    {"sine", 0, RunSine},
    {"bgaffine", 1, RunBgAffine},
    {"objaffine", 2, RunObjAffine},
};

static void WriteOutput(const char *path, const struct HostCall *call)
{
    FILE *file = fopen(path, "wb");
    uint8_t result[4] = {call->result, call->result >> 8, call->result >> 16, call->result >> 24};

    if (file == NULL || fwrite(result, 1, 4, file) != 4
     || fwrite(call->dest, 1, call->destLength, file) != call->destLength || fclose(file) != 0)
        Fail("cannot write the output");
}

int main(int argc, char **argv)
{
    struct HostCall call = {0};
    size_t length, i;
    uint8_t *bytes;

    if (argc != 4)
        Fail("usage: irv_layer_host <command> <input> <output>");
    bytes = ReadFile(argv[2], &length);
    ParseCall(bytes, length, &call);
    for (i = 0; i < sizeof(sCommands) / sizeof(sCommands[0]); i++)
    {
        if (strcmp(argv[1], sCommands[i].name) != 0)
            continue;
        if (call.argc != sCommands[i].argc)
            Fail("the command takes another number of arguments");
        sCommands[i].run(&call);
        WriteOutput(argv[3], &call);
        return 0;
    }
    fprintf(stderr, "irv_layer_host: no command %s\n", argv[1]);
    return 2;
}
