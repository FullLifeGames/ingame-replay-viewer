// The rules by which a number of ours under pokebw2's names counts as the generated one in
// build/gen5/bw2.json, for the fixtures' guard (scripts/gen5-fixtures-real.test.ts) and the
// typed-literal check (scripts/gen5-literals-real.test.ts). A field counts at its real place, its
// offset and bit, whatever its size; a first member at offset 0 only in its real size and width
// too; any other number when it equals the generated one, but a struct's alignment.
//
// Small values, 0 to 3, count like large ones: under a name they carry a fact of pokebw2's code
// as a large one does, such as which client is the opponent's or which block opens the first row.
// The rules leave out what every struct shares (widths, alignment, a first member at offset 0),
// not small numbers. Only where a type sits at several places of the generated file and the
// literal names none of them does a small value name nothing: an invented packer's `arg: 0`
// meets one of the many real puts by construction. A failure names paths alone.

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A struct's field: an offset and a size, maybe a bit and a width. */
const isField = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && typeof value.offset === 'number' && typeof value.size === 'number'

/** A field's place: its offset and, for a bit field, its bit. */
const place = (field: Record<string, unknown>) => [field.offset, field.bit ?? 0]
const isZero = (field: Record<string, unknown>) => place(field).every((part) => part === 0)

/** A field shows the real layout at the real place, whatever its size; at offset 0 and bit 0,
 * where every struct starts, only in the real size and width too. */
function sameField(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const [offset, bit] = place(a)
  if (offset !== b.offset || bit !== (b.bit ?? 0)) return false
  return !isZero(a) || (a.size === b.size && a.bits === b.bits)
}

/** A struct's alignment: on the game's compiler 1, 2 or 4 by its widest member, so like a field's
 * width it says nothing on its own. */
const isAlign = (struct: Record<string, unknown>, key: string) =>
  key === 'align' && isObject(struct.fields)

/** A value from 0 to 3, which names nothing at several places (the header says why). */
const isSmall = (value: number) => Number.isInteger(value) && value >= 0 && value <= 3

/** A number of ours that counts as the generated one. */
const sameNumber = (value: number, real: unknown, countSmall: boolean) =>
  value === real && (countSmall || !isSmall(value))

/** Every name under `name` whose number of ours equals the generated number at the same place: a
 * field by `sameField`, or any other number but a struct's alignment; with `countSmall` false, no
 * value from 0 to 3 but a field's place. */
export function equalNames(
  fixture: unknown,
  real: unknown,
  name: string,
  countSmall = true,
): string[] {
  if (typeof fixture === 'number') return sameNumber(fixture, real, countSmall) ? [name] : []
  if (isField(fixture) && isField(real)) return sameField(fixture, real) ? [name] : []
  if (!isObject(fixture) || !isObject(real)) return []
  return Object.keys(fixture)
    .filter((key) => key in real && !isAlign(fixture, key))
    .flatMap((key) => equalNames(fixture[key], real[key], `${name}.${key}`, countSmall))
}

/** The part of the generated file at `path`, or undefined. */
export const at = (root: unknown, path: readonly string[]) =>
  path.reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), root)

/** The root key that holds the number of our own shape (`BW2_NUMBERS_VERSION`), not pokebw2's. */
const OWN_ROOT_KEY = 'version'

/** `equalNames` of a value against the generated file's part at `path`; at the root without the
 * shape's own version. */
export function namesAt(value: unknown, file: unknown, path: readonly string[], name: string) {
  const real = at(file, path)
  if (path.length > 0 || !isObject(value)) return equalNames(value, real, name)
  const rest = Object.entries(value).filter(([key]) => key !== OWN_ROOT_KEY)
  return equalNames(Object.fromEntries(rest), real, name)
}
