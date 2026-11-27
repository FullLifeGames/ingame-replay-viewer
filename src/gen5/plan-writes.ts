// Reads a plan's adapter writes back (#110): the adapter commands and states that its writes put
// after the hold of the server. The specs of the replay's and the moment's plans hold by it that
// no write after the hold asks for the player's action, so the client starts no action selection
// and no trainer's hint line shows (#76, CheckTrainerHintMsg). Pure: no Node, no DOM.
import type { MacroStep } from './macro.ts'

/** A little-endian field's value. */
const valueOf = (bytes: readonly number[]) =>
  bytes.reduceRight((value, byte) => value * 256 + byte, 0)

/** The adapter commands (`cmd` and `sendCmd.cmd`) and the states that the writes after the step
 * `hold` put, each once, in the order first written. */
export function writesAfterHold(plan: readonly MacroStep[]): {
  commands: number[]
  states: number[]
} {
  const hold = plan.findIndex((step) => step.kind === 'write' && step.name === 'hold')
  if (hold < 0) throw new Error('the plan holds no server: it has no write hold')
  const writes = plan.slice(hold + 1).flatMap((step) => (step.kind === 'write' ? step.writes : []))
  const values = (fields: readonly string[]) => [
    ...new Set(
      writes.flatMap((write) =>
        write.kind === 'bytes' && fields.includes(write.field) ? [valueOf(write.bytes)] : [],
      ),
    ),
  ]
  return { commands: values(['cmd', 'sendCmd.cmd']), states: values(['state']) }
}
