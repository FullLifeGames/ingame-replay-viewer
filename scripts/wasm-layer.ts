// Our platform layer of the WebAssembly build (#43): the C files of rom/gen3/wasm/layer enter the
// module with the glue, and the same list compiles natively into the host harness
// (the C files of layer/host), so the specs run the layer in CI without emsdk or the expansion.
// The harness serves one command per run: `irv_layer_host <command> <input> <output>`. The input
// holds the arguments, a source and a destination; the output holds a result word and the
// destination after the call.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { WASM_DIR } from './wasm-config.ts'

export const LAYER_DIR = join(WASM_DIR, 'layer')
const HOST_DIR = join(LAYER_DIR, 'host')
const INSTALL = 'install one with sudo apt install gcc, or name it in CC'

/** The C files of one folder of the build, sorted, without those of its subfolders. */
export function folderSources(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.c'))
    .sort()
    .map((name) => join(dir, name))
}

/** The layer's C files; its harness under host/ never enters the module. */
export const layerSources = (dir: string = LAYER_DIR) => folderSources(dir)

export function hostCommand(output: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const cc = env.CC ?? 'cc'
  const flags = ['-std=gnu17', '-O1', '-Wall', '-Wextra', '-Werror', '-DIRV_HOST']
  const sources = [...layerSources(), ...folderSources(HOST_DIR)]
  return [cc, ...flags, '-I', LAYER_DIR, ...sources, '-lm', '-o', output]
}

/** Compiles the harness into `dir` and returns its path. */
export function buildHost(dir: string, env: NodeJS.ProcessEnv = process.env): string {
  const output = join(dir, 'irv_layer_host')
  const [cc, ...args] = hostCommand(output, env)
  const result = spawnSync(cc as string, args, { encoding: 'utf8' })
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    throw new Error(`no C compiler ${String(cc)} for the layer's harness; ${INSTALL}`)
  }
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`the layer's harness does not compile:\n${result.stderr}`)
  }
  return output
}

export interface LayerRequest {
  /** Up to eight words; a signed argument goes as its two's complement. */
  args?: readonly number[]
  src?: ArrayLike<number>
  dest?: Uint8Array
}

export interface LayerOutput {
  result: number
  dest: Uint8Array
}

function word(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24]
}

export function layerInput({ args = [], src = [], dest = new Uint8Array(0) }: LayerRequest) {
  return Uint8Array.from([
    ...word(args.length),
    ...args.flatMap(word),
    ...word(src.length),
    ...Array.from(src),
    ...word(dest.length),
    ...dest,
  ])
}

export function readLayerOutput(bytes: Uint8Array): LayerOutput {
  if (bytes.length < 4) {
    throw new Error(`the harness wrote ${String(bytes.length)} bytes, too few for a result`)
  }
  const result = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)
  return { result, dest: bytes.slice(4) }
}

/** Runs one command of the harness at `host` on the request; `log` holds what the layer printed. */
export function runLayer(
  host: string,
  command: string,
  request: LayerRequest,
): LayerOutput & { log: string } {
  const dir = mkdtempSync(join(host, '..', 'call-'))
  const [input, output] = [join(dir, 'in.bin'), join(dir, 'out.bin')]
  writeFileSync(input, layerInput(request))
  const result = spawnSync(host, [command, input, output], { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `irv_layer_host ${command} failed (exit ${String(result.status)}): ${result.stderr}`,
    )
  }
  return { ...readLayerOutput(new Uint8Array(readFileSync(output))), log: result.stdout }
}
