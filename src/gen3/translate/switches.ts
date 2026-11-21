// Switches and faints (plan §6).
import { Gen3Error } from '../errors'
import type { Context, EventOf } from './context'
import { sendOutLead } from './intro'

export function switchIn(event: EventOf<'switchIn'>, ctx: Context): void {
  if (ctx.leads !== undefined) {
    sendOutLead(event, ctx, ctx.leads)
    return
  }
  throw new Gen3Error('not yet')
}
