// The worker of the WebAssembly spike page (#35): one run of the game. It takes the page's start
// message, instantiates the module the page compiled, writes the stream into the slot (refused if
// the slot's own header and replay-slot.json come from different builds) and calls AgbMain, which
// never returns. Each frame's sound goes into the audio ring (audio.ts), and each
// frame through the frame hook (game.ts), which blocks with Atomics.wait until the page allows
// the next one. The page ends a run by terminating the
// worker. No DOM; the e2e covers it, as it covers the page's other wiring.
import header from '../../../rom/gen3/include/replay_progress.h?raw'
import slotHeader from '../../../rom/gen3/include/replay_slot.h?raw'
import { readSlotHeaderLayout } from '../../patch/slot'
import { messageOf } from '../message'
import { audioHandler } from './audio'
import { frameHandler, type GameModule, type ModuleHooks, writeStream } from './game'
import type { StartMessage, WorkerReport } from './messages'
import { readProgressLayout } from './progress'

/** Emscripten's hook for a module the host instantiates itself. */
type Instantiate = (
  imports: WebAssembly.Imports,
  receive: (instance: WebAssembly.Instance) => void,
) => object

type Factory = (hooks: ModuleHooks & { instantiateWasm: Instantiate }) => Promise<GameModule>

interface WorkerScope {
  onmessage: ((event: MessageEvent<StartMessage>) => void) | null
  postMessage(report: WorkerReport): void
}

const scope = self as unknown as WorkerScope
const report = (message: WorkerReport) => {
  scope.postMessage(message)
}

async function run(start: StartMessage): Promise<void> {
  const { default: factory } = (await import(/* @vite-ignore */ start.glueUrl)) as {
    default: Factory
  }
  const game: GameModule = await factory({
    irvFrame: frameHandler(() => game, start.buffers, readProgressLayout(header)),
    irvAudio: audioHandler(() => game, start.buffers),
    print: (line) => {
      // eslint-disable-next-line no-console -- the game's own print lines, for the console
      console.log(`game: ${line}`)
    },
    printErr: (line) => {
      // eslint-disable-next-line no-console -- the game's own print lines, for the console
      console.warn(`game: ${line}`)
    },
    instantiateWasm: (imports, receive) => {
      void WebAssembly.instantiate(start.module, imports).then(receive, (error: unknown) => {
        report({ type: 'failed', line: `The module did not instantiate: ${messageOf(error)}` })
      })
      return {}
    },
  })
  try {
    writeStream(game, start.slot, start.stream, readSlotHeaderLayout(slotHeader))
  } catch (error) {
    report({
      type: 'failed',
      line: `Could not write the replay into the module: ${messageOf(error)}`,
    })
    return
  }
  report({ type: 'running' })
  game._AgbMain()
  report({ type: 'failed', line: 'AgbMain returned, which the game never does' })
}

scope.onmessage = (event) => {
  scope.onmessage = null
  run(event.data).catch((error: unknown) => {
    report({ type: 'failed', line: `The game stopped: ${messageOf(error)}` })
  })
}
