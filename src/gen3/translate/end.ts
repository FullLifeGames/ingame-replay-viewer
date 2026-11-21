// The end of the battle (plan §6, D8): the win or tie line, then END, the stream's last op. A line
// of the simulator's own, such as a forfeit, prints as it reads.
import { nameTrainer } from '../text/names'
import { simulatorMessage, tie as tieLine, won } from '../text/phrases-field'
import type { Context, EventOf } from './context'

export function message({ text, line }: EventOf<'message'>, ctx: Context): void {
  ctx.print(line, simulatorMessage(text))
}

/** A winner the intro did not name gets the name as the log gives it and an unknown outcome. */
export function win({ side, name, line }: EventOf<'win'>, ctx: Context): void {
  const winner = side === undefined ? nameTrainer(name) : { text: ctx.player(side).text }
  ctx.print(line, { ...winner, text: won(winner.text) })
  const outcome = side === undefined ? 'unknown' : side === 'near' ? 'nearWon' : 'farWon'
  ctx.emit(line, { op: 'end', outcome })
}

export function tie({ line }: EventOf<'tie'>, ctx: Context): void {
  ctx.print(line, tieLine())
  ctx.emit(line, { op: 'end', outcome: 'tie' })
}
