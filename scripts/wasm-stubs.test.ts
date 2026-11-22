// The stubs a replay run may call (#46). rom/gen3/wasm/src/irv_wasm_stub_list.h holds the list;
// irv_wasm_stubs.c reads it and stops the run at the first call of any other stub, with the
// stub's name. This spec compiles the list and its lookup natively, as the layer's harness
// compiles the layer, so it runs in CI without emsdk.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { WASM_DIR } from './wasm-config.ts'

const GLUE_DIR = join(WASM_DIR, 'src')
const STUBS = join(GLUE_DIR, 'irv_wasm_stubs.c')

// With no argument it prints the list, one name per line; with names, each name and whether the
// list lets it run.
const PROBE = `#include <stdio.h>
#include "irv_wasm_stub_list.h"

int main(int argc, char **argv)
{
    unsigned int i;

    if (argc == 1)
    {
        for (i = 0; i < sizeof(sStubsARunMayCall) / sizeof(sStubsARunMayCall[0]); i++)
            printf("%s\\n", sStubsARunMayCall[i]);
        return 0;
    }
    for (i = 1; i < (unsigned int)argc; i++)
        printf("%s %s\\n", argv[i], IrvWasm_StubMayRun(argv[i]) ? "runs" : "stops");
    return 0;
}
`

const scratch = mkdtempSync(join(tmpdir(), 'irv-stubs-'))
const probe = join(scratch, 'stub_probe')
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

beforeAll(() => {
  const source = join(scratch, 'stub_probe.c')
  writeFileSync(source, PROBE)
  const flags = ['-std=gnu17', '-O1', '-Wall', '-Wextra', '-Werror']
  const result = spawnSync(
    process.env.CC ?? 'cc',
    [...flags, '-I', GLUE_DIR, source, '-o', probe],
    {
      encoding: 'utf8',
    },
  )
  if (result.status !== 0) throw new Error(`the stub probe does not compile:\n${result.stderr}`)
})

function runProbe(names: readonly string[] = []): string[] {
  const result = spawnSync(probe, names, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`the stub probe failed: ${result.stderr}`)
  return result.stdout.split('\n').filter((line) => line !== '')
}

// The stubs of irv_wasm_stubs.c that log and carry on: two macros and the flash stubs that call
// StubCalled themselves.
function loggedStubNames(source: string): string[] {
  const macros = source.matchAll(/^(?:LOGGED_STUB\([^,]+,|LOGGED_VOID_STUB\()\s*(\w+)/gm)
  const direct = source.matchAll(/StubCalled\("(\w+)"/g)
  return [...macros, ...direct].map((match) => match[1] as string)
}

// Every stub of irv_wasm_stubs.c: the logged ones and those that cannot work here.
function stubNames(source: string): string[] {
  const unsupported = source.matchAll(/^UNSUPPORTED_STUB\((\w+)/gm)
  return [...loggedStubNames(source), ...[...unsupported].map((match) => match[1] as string)]
}

const INIT_RFU = [
  'rfu_initializeAPI',
  'rfu_setTimerInterrupt',
  'rfu_REQ_stopMode',
  'rfu_waitREQComplete',
]

describe('the stubs a replay run may call', () => {
  it('are the four that InitRFU calls at boot, the only stubs the runs on record reach', () => {
    expect(runProbe()).toEqual(INIT_RFU)
  })

  it('are stubs of irv_wasm_stubs.c that log and carry on', () => {
    const logged = loggedStubNames(readFileSync(STUBS, 'utf8'))
    for (const name of runProbe()) expect(logged).toContain(name)
  })

  it('let the listed stubs run and stop every other stub of irv_wasm_stubs.c', () => {
    const names = stubNames(readFileSync(STUBS, 'utf8'))
    expect(names.length).toBeGreaterThan(60)
    const runs = runProbe(names)
      .filter((line) => line.endsWith(' runs'))
      .map((line) => line.split(' ')[0])
    expect(runs.sort()).toEqual([...INIT_RFU].sort())
    expect(runProbe(['SoftReset', 'EraseFlashSector', 'rfu_REQ_reset'])).toEqual([
      'SoftReset stops',
      'EraseFlashSector stops',
      'rfu_REQ_reset stops',
    ])
  })

  it('match a name whole, not a name that starts or ends like a listed one', () => {
    expect(runProbe(['rfu_initializeAP', 'rfu_initializeAPI_', 'x'])).toEqual([
      'rfu_initializeAP stops',
      'rfu_initializeAPI_ stops',
      'x stops',
    ])
  })
})
