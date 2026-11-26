// Lookups into the direct entry's numbers (#97, build/gen5/bw2.json's `entry`) that throw with the
// name they miss, so a plan never writes through an offset the generator did not give.
import type { EntryNumbers, FieldLayout, StructLayout } from './bw2-numbers.ts'

export function entryLayout(entry: EntryNumbers, struct: string): StructLayout {
  const layout = entry.layouts[struct]
  if (layout === undefined) throw new Error(`the entry has no layout ${struct}`)
  return layout
}

export function entryField(entry: EntryNumbers, struct: string, member: string): FieldLayout {
  const field = entryLayout(entry, struct).fields[member]
  if (field === undefined) throw new Error(`the entry's ${struct} has no member ${member}`)
  return field
}

export function entryConstant(entry: EntryNumbers, name: string): number {
  const value = entry.constants[name]
  if (value === undefined) throw new Error(`the entry has no constant ${name}`)
  return value
}

export function entryAddress(entry: EntryNumbers, name: string): number {
  const symbol = entry.data[name]
  if (symbol === undefined) throw new Error(`the entry has no data ${name}`)
  return symbol.address
}

export function entryCall(entry: EntryNumbers, name: string): number {
  const fn = entry.functions[name]
  if (fn === undefined) throw new Error(`the entry has no function ${name}`)
  return fn.call
}
