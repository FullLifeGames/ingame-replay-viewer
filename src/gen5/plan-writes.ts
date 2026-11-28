// Reads a plan's writes back (#110, #118): the adapter commands and states that its writes put
// after the hold of the server, and the fields they touch. The specs of the replay's and the
// moment's plans hold by it that no write after the hold asks for the player's action, so the
// client starts no action selection and no trainer's hint line shows (#76, CheckTrainerHintMsg),
// and that a printed block touches the text box's buffer and nothing else of the game's. Pure: no
// Node, no DOM.
import type { MacroStep } from './macro.ts'
import type { MemoryWrite } from './ram-write.ts'

/** A little-endian field's value. */
const valueOf = (bytes: readonly number[]) =>
  bytes.reduceRight((value, byte) => value * 256 + byte, 0)

/** The writes of every write step after the step `hold`, in plan order. */
function afterHold(plan: readonly MacroStep[]): MemoryWrite[] {
  const hold = plan.findIndex((step) => step.kind === 'write' && step.name === 'hold')
  if (hold < 0) throw new Error('the plan holds no server: it has no write hold')
  return plan.slice(hold + 1).flatMap((step) => (step.kind === 'write' ? [...step.writes] : []))
}

/** The adapter commands (`cmd` and `sendCmd.cmd`) and the states that the writes after the step
 * `hold` put, each once, in the order first written. */
export function writesAfterHold(plan: readonly MacroStep[]): {
  commands: number[]
  states: number[]
} {
  const writes = afterHold(plan)
  const values = (fields: readonly string[]) => [
    ...new Set(
      writes.flatMap((write) =>
        write.kind === 'bytes' && fields.includes(write.field) ? [valueOf(write.bytes)] : [],
      ),
    ),
  ]
  return { commands: values(['cmd', 'sendCmd.cmd']), states: values(['state']) }
}

/** The fields the writes after the step `hold` touch, each once, in the order first written. */
export function fieldsAfterHold(plan: readonly MacroStep[]): string[] {
  return [...new Set(afterHold(plan).map((write) => write.field))]
}
