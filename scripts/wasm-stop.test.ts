// The stop of a run (#46, #61): a stub off the list in irv_wasm_stubs.c ends the run with the
// stub's name, an assert that stops the program ends it there with its file, line and expression,
// and a mixer at another rate than the page's ends it in irv_wasm_sound.c. All go through
// irv_wasm_stop.c. This spec compiles the three glue files natively against the pinned tree, with a
// shadow emscripten/em_js.h that turns each EM_JS import into a plain declaration. The probe
// defines the imports in C and prints what the page would see, so it runs on the build machine in
// seconds (CI has no tree).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readerTree } from './rom-paths.ts'
import { CPPFLAGS } from './wasm-compile.ts'
import { WASM_DIR } from './wasm-config.ts'
import { LAYER_DIR } from './wasm-layer.ts'

const GLUE_DIR = join(WASM_DIR, 'src')
const SHADOW_DIR = join(WASM_DIR, 'include')
const include = join(readerTree(), 'include')

// An EM_JS import becomes a declaration; the probe defines it. EM_JS_DEPS asks the link for
// JavaScript helpers, which a native build has no use for.
const EM_JS = `#define EM_JS(ret, name, params, ...) ret name params;
#define EM_JS_DEPS(tag, deps)
`

// The probe stands in for the host: a stop prints its line and exits with 3, as the throw ends
// the run. Its one argument names the call it makes.
const PROBE = `#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void rfu_REQ_stopMode(void);
void rfu_REQ_reset(void);
void SoftReset(unsigned int resetFlags);
void IrvSound_HandOver(const float *pairs, unsigned int count, int rate);
void MgbaAssert(const char *pFile, int nLine, const char *pExpression, unsigned int nStopProgram);

void IrvWasm_Throw(const char *line)
{
    printf("stopped: %s\\n", line);
    exit(3);
}

void IrvWasm_HandOverAudio(const float *samples, int count, int rate)
{
    printf("handed over %d floats at %d Hz\\n", count, rate);
}

int mini_vsnprintf(char *buffer, unsigned int length, const char *format, va_list args)
{
    return vsnprintf(buffer, length, format, args);
}

static const float sPairs[4] = {0};

int main(int argc, char **argv)
{
    const char *call = argc > 1 ? argv[1] : "";

    if (strcmp(call, "listed") == 0)
    {
        rfu_REQ_stopMode();
        rfu_REQ_stopMode();
    }
    else if (strcmp(call, "unlisted") == 0)
    {
        rfu_REQ_reset();
    }
    else if (strcmp(call, "unsupported") == 0)
    {
        SoftReset(0);
    }
    else if (strcmp(call, "mixer") == 0)
    {
        IrvSound_HandOver(sPairs, 2, 42048);
    }
    else if (strcmp(call, "other-rate") == 0)
    {
        IrvSound_HandOver(sPairs, 2, 13379);
    }
    else if (strcmp(call, "assert") == 0)
    {
        MgbaAssert("src/malloc.c", 97, "block->magic == MALLOC_SYSTEM_ID", 1);
    }
    else if (strcmp(call, "warning") == 0)
    {
        MgbaAssert("src/malloc.c", 97, "block->magic == MALLOC_SYSTEM_ID", 0);
    }
    printf("carried on\\n");
    return 0;
}
`

const scratch = mkdtempSync(join(tmpdir(), 'irv-stop-'))
const probe = join(scratch, 'stop_probe')
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

// The include order of the module's glue compile (wasm-compile.ts): the shadow headers, the
// tree's include, the layer, then the shadow headers again for angle includes.
function compileProbe(): void {
  mkdirSync(join(scratch, 'emscripten'))
  writeFileSync(join(scratch, 'emscripten', 'em_js.h'), EM_JS)
  writeFileSync(join(scratch, 'stop_probe.c'), PROBE)
  const includes = ['-iquote', SHADOW_DIR, '-iquote', include, '-iquote', LAYER_DIR]
  const angle = ['-I', SHADOW_DIR, '-I', scratch]
  const flags = ['-O1', '-Wall', '-Wno-strict-aliasing', ...CPPFLAGS, '-DIRV_WASM']
  const glue = ['irv_wasm_stop.c', 'irv_wasm_stubs.c', 'irv_wasm_sound.c']
  const sources = [...glue.map((name) => join(GLUE_DIR, name)), join(scratch, 'stop_probe.c')]
  const result = spawnSync(
    process.env.CC ?? 'cc',
    [...flags, ...includes, ...angle, ...sources, '-o', probe],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error(`the stop probe does not compile:\n${result.stderr}`)
}

function runProbe(call: string): { status: number | null; lines: string[] } {
  const result = spawnSync(probe, [call], { encoding: 'utf8' })
  return { status: result.status, lines: result.stdout.split('\n').filter((line) => line !== '') }
}

describe.skipIf(!existsSync(include))('the stop of a run (pinned tree)', () => {
  beforeAll(compileProbe)

  describe('at a stub', () => {
    it('carries on at a listed stub and logs its name once', () => {
      expect(runProbe('listed')).toEqual({
        status: 0,
        lines: ['irv-emerald: rfu_REQ_stopMode is a stub in the WebAssembly build', 'carried on'],
      })
    })

    it('stops at a stub off the list with its name', () => {
      expect(runProbe('unlisted')).toEqual({
        status: 3,
        lines: ['stopped: irv-emerald: rfu_REQ_reset is a stub that no replay should call'],
      })
    })

    it('stops at a stub that cannot work here with its name', () => {
      expect(runProbe('unsupported')).toEqual({
        status: 3,
        lines: ['stopped: irv-emerald: SoftReset is a stub that no replay should call'],
      })
    })
  })

  describe("at the mixer's hand-over to the page", () => {
    it('hands the pairs over at the rate the page expects', () => {
      expect(runProbe('mixer')).toEqual({
        status: 0,
        lines: ['handed over 4 floats at 42048 Hz', 'carried on'],
      })
    })

    it('stops the run at another rate, through the same stop as the stubs', () => {
      expect(runProbe('other-rate')).toEqual({
        status: 3,
        lines: ['stopped: irv-emerald: the mixer runs at 13379 Hz, the page expects 42048 Hz'],
      })
    })
  })

  describe('at an assert', () => {
    it('stops at an assert with its file, line and expression', () => {
      expect(runProbe('assert')).toEqual({
        status: 3,
        lines: [
          'ASSERTION FAILED  FILE=[src/malloc.c] LINE=[97]  EXP=[block->magic == MALLOC_SYSTEM_ID]',
          'stopped: irv-emerald: assert failed at src/malloc.c line 97: block->magic == MALLOC_SYSTEM_ID',
        ],
      })
    })

    it('prints a warning and carries on', () => {
      expect(runProbe('warning')).toEqual({
        status: 0,
        lines: [
          'WARNING FILE=[src/malloc.c] LINE=[97]  EXP=[block->magic == MALLOC_SYSTEM_ID]',
          'carried on',
        ],
      })
    })
  })
})
