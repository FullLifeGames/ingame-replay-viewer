// What the Gen 5 spike's route waits for at its end (#72): a local battle whose player client
// stands in the action menu. pokebw2's btl_adapter.c: in a local battle (sCommMode 0) the server
// and client share one adapter per client ID; the client takes `sendCmd.cmd` while `returned` is
// 0 and sets `returned` once it has replied. BTL_ACMD_SELECT_ACTION with `returned` 0 is the client
// asking the player for an action while the server waits for the reply. The addresses and the
// layout come from build/gen5/bw2.json; this module holds none of the game's numbers.
import type { Bw2Numbers, FieldLayout } from './bw2-numbers.ts'
import type { RamCheck, RamRef } from './ram-check.ts'

function symbolAddress(numbers: Bw2Numbers, name: string): number {
  const symbol = numbers.symbols[name]
  if (symbol === undefined) throw new Error(`bw2.json names no symbol ${name}`)
  return symbol.address
}

function command(numbers: Bw2Numbers, name: string): number {
  const value = numbers.adapterCommands[name]
  if (value === undefined) throw new Error(`bw2.json names no ${name}`)
  return value
}

/** A field of the adapter that `sAdapters[0]` points to, under its bitfield mask if it has one. */
function adapterField(numbers: Bw2Numbers, name: string): RamRef {
  const field: FieldLayout | undefined = numbers.adapter.fields[name]
  if (field === undefined) throw new Error(`the adapter's layout has no field ${name}`)
  if (field.size !== 1 && field.size !== 2 && field.size !== 4) {
    throw new Error(`the adapter's field ${name} has ${String(field.size)} bytes`)
  }
  const ref: RamRef = {
    name,
    address: symbolAddress(numbers, 'sAdapters'),
    offset: field.offset,
    width: field.size,
  }
  if (field.bits === undefined) return ref
  return { ...ref, mask: (2 ** field.bits - 1) * 2 ** (field.bit ?? 0) }
}

/** The checks of the end condition and the values to log each time one changes. */
export function battleRefs(numbers: Bw2Numbers): { checks: RamCheck[]; watch: RamRef[] } {
  const adapters = symbolAddress(numbers, 'sAdapters')
  const mode: RamRef = { name: 'sCommMode', address: symbolAddress(numbers, 'sCommMode'), width: 4 }
  const first: RamRef = { name: 'sAdapters[0]', address: adapters, width: 4 }
  const field = (name: string) => adapterField(numbers, name)
  const fields = ['returned', 'isNet', 'clientId', 'state', 'cmd', 'sendCmd.cmd', 'sendCmd.size']
  const watch = [
    mode,
    first,
    { name: 'sAdapters[1]', address: adapters + 4, width: 4 as const },
    ...fields.map(field),
  ]
  const checks: RamCheck[] = [
    { ...mode, oneOf: [0] },
    { ...first, mainRamPointer: true },
    { ...field('returned'), oneOf: [0] },
    { ...field('sendCmd.cmd'), oneOf: [command(numbers, 'BTL_ACMD_SELECT_ACTION')] },
    { ...field('sendCmd.size'), atMost: numbers.queueSize },
  ]
  return { checks, watch }
}
