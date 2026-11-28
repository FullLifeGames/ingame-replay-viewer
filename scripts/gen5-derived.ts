// The derivations' compare (#138): a hop, mask or value that a function of src/gen5/ or
// scripts/gen5-* computes from two fixture numbers can land on the generated one while each input
// differs, as a mask derived from a bit and a width did in wave 7 (W7-7). So the check runs each
// derivation of the table (scripts/gen5-derived-table.ts) on its fixture and on
// build/gen5/bw2.json, and names every number that comes out equal at the same path.
//
// Only the numbers under a role key count: an address, a hop, a mask, a value, a check's values
// and bounds, an offset and a bit. A read's width and the main RAM flag are ours; written bytes
// (sealed Pokémon, the routine's code, names, text, packed commands) stay out, since one byte
// matches by chance and the guard holds the numbers behind them by name. A row can add keys of
// offsets, as a record of block places. A 0 under a hop or an offset names nothing: every struct
// and every buffer starts there. A number that our code fixes, equal on both
// sides by construction, stands in the table's list of our own with its reason. A finding names
// the derivation, the check and the path, never a value.
import { isObject } from './gen5-numbers-compare.ts'

/** The keys whose numbers carry a derived fact of pokebw2. */
const ROLE_KEYS = new Set([
  'address',
  'hops',
  'mask',
  'value',
  'oneOf',
  'noneOf',
  'atMost',
  'offset',
  'bit',
])

/** The keys that hold no number of pokebw2: our read widths and written bytes. */
const OUR_KEYS = new Set(['width', 'mainRamPointer', 'bytes'])

/** The keys under which a 0 is where every struct starts. */
const START_KEYS = new Set(['hops', 'offset'])

/** A derived number equal on both sides by construction: the derivation, the check by its name
 * and, where one check's name stands in several steps, the step by its name, the role key and the
 * reason. */
export interface OursDerived {
  readonly derivations: readonly string[]
  readonly step?: RegExp
  readonly check: RegExp
  readonly key: string
  readonly reason: string
}

/** A number found equal: its step and check by name, the role key above it and its path. */
interface Equal {
  readonly step: string
  readonly check: string
  readonly key: string
  readonly path: string
}

/** Where the walk stands: the path, the outermost and the innermost name above, the role key
 * above, if any. */
interface Place {
  readonly path: string
  readonly step: string
  readonly check: string
  readonly key: string | undefined
}

/** A value as plain parts: a byte array as an array. */
const plain = (value: unknown): unknown => (value instanceof Uint8Array ? [...value] : value)

/** The name of a check, a write or a step, which labels the numbers inside it. */
const labelOf = (value: Record<string, unknown>, check: string) =>
  typeof value.name === 'string'
    ? value.name
    : typeof value.field === 'string'
      ? value.field
      : check

/** Whether a number at `place` counts: under a role key, and no 0 where every struct starts,
 * under a hop, an offset or a key of offsets that a row adds. */
const counts = (value: number, key: string | undefined) =>
  key !== undefined && !(value === 0 && (START_KEYS.has(key) || !ROLE_KEYS.has(key)))

function equalsIn(ours: unknown, real: unknown, place: Place, roles: Set<string>): Equal[] {
  const value = plain(ours)
  const other = plain(real)
  if (typeof value === 'number') {
    if (!counts(value, place.key) || value !== other) return []
    const { step, check, path } = place
    return [{ step, check, key: place.key ?? '', path }]
  }
  if (Array.isArray(value)) {
    const list: unknown[] = Array.isArray(other) ? other : []
    const at = (index: number) => ({ ...place, path: `${place.path}.${String(index)}` })
    return value.flatMap((part, index) => equalsIn(part, list[index], at(index), roles))
  }
  if (!isObject(value)) return []
  const check = labelOf(value, place.check)
  const step = place.step === '' ? check : place.step
  return Object.keys(value)
    .filter((key) => !OUR_KEYS.has(key))
    .flatMap((key) => {
      const role = roles.has(key) ? key : place.key
      const inner = { path: `${place.path}.${key}`, step, check, key: role }
      return equalsIn(value[key], isObject(other) ? other[key] : undefined, inner, roles)
    })
}

/** Whether `ours` names an equal number of the derivation `name`. */
const isOurs = (equal: Equal, name: string, ours: readonly OursDerived[]) =>
  ours.some(
    ({ derivations, step, check, key }) =>
      derivations.includes(name) &&
      (step?.test(equal.step) ?? true) &&
      check.test(equal.check) &&
      key === equal.key,
  )

/** A number's label: its check, after its step when the two differ. */
const labelIn = ({ step, check }: Equal) => (step === check ? check : `${step} / ${check}`)

/** Every number of the derivation `name` that equals the real derivation's at the same path under
 * a role key or one of `keys`, a row's keys of offsets, but those in `ours`; each as
 * `name <step / check> path`. */
export function derivedNames(
  name: string,
  outputs: { ours: unknown; real: unknown },
  ours: readonly OursDerived[],
  keys: readonly string[] = [],
): string[] {
  const roles = new Set([...ROLE_KEYS, ...keys])
  const root = { path: '', step: '', check: '', key: undefined }
  return equalsIn(outputs.ours, outputs.real, root, roles)
    .filter((equal) => !isOurs(equal, name, ours))
    .map((equal) => `${name} <${labelIn(equal)}>${equal.path}`)
}
