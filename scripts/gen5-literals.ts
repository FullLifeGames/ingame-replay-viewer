// The typed-literal check (#138): it finds each literal that a spec writes as a type of pokebw2's
// numbers (src/gen5/bw2-numbers.ts and the two files it imports) and compares it with the
// generated file at that type's places, by the fixtures' guard's rules
// (scripts/gen5-numbers-compare.ts). The TypeScript compiler gives each literal its written type:
// the outermost `as` or `satisfies` type that is not `unknown`, else its contextual type, as a
// declared variable, a parameter or a record's value gives it. A finding names the file, the line
// and the member path, never a value.
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'

import { innerExpression, plainValue } from './gen5-literal-values.ts'
import { at, equalNames, isObject, namesAt } from './gen5-numbers-compare.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const REPO = GEN5_PATHS.repo

/** The files that declare the numbers types. */
const NUMBERS_FILES = ['bw2-numbers.ts', 'bw2-gauge-numbers.ts', 'bw2-flow-numbers.ts'].map(
  (file) => join(REPO, 'src/gen5', file),
)

/** The folders whose specs the check reads. */
const LITERAL_FOLDERS = ['scripts', 'src/gen5', 'src/web/gen5']

/** How deep the walk from the generated file's root type goes; the file is 6 levels deep. */
const TYPE_DEPTH = 12

/** Every spec of the check's folders, by absolute path. */
export const specFiles = (): string[] =>
  LITERAL_FOLDERS.flatMap((folder) =>
    readdirSync(join(REPO, folder), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.test.ts'))
      .map((file) => join(REPO, folder, file))
      .sort(),
  )

/** The compiler's program over the specs and the numbers types, with the scripts' options. */
export function literalProgram(files: readonly string[]): ts.Program {
  const read = (file: string) => ts.sys.readFile(file)
  const config: unknown = ts.readConfigFile(join(REPO, 'tsconfig.node.json'), read).config
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, REPO)
  return ts.createProgram({ rootNames: [...files, ...NUMBERS_FILES], options })
}

/** A numbers type: its name, and its places in the generated file, `*` at a record's key or an
 * array's element. */
interface NumbersType {
  readonly label: string
  readonly paths: string[][]
}

/** A literal of a numbers type in a spec. */
export interface TypedLiteral {
  readonly file: string
  readonly line: number
  readonly label: string
  readonly paths: readonly (readonly string[])[]
  /** The record key it sits under, which picks one of the type's record places. */
  readonly key: string | undefined
  readonly value: unknown
}

export interface LiteralFinding {
  readonly file: string
  readonly line: number
  readonly name: string
}

/** The declaration of the numbers type that a type is, or undefined. */
function numbersDeclaration(type: ts.Type): ts.Declaration | undefined {
  if (type.isUnion()) return type.types.map(numbersDeclaration).find(Boolean)
  for (const symbol of [type.aliasSymbol, type.getSymbol()]) {
    const declaration = symbol?.declarations?.[0]
    if (declaration && NUMBERS_FILES.includes(declaration.getSourceFile().fileName)) {
      return declaration
    }
  }
  return undefined
}

/** A type's parts: each property's type by name, `*` for a record's or an array's values. */
function partsOf(type: ts.Type, checker: ts.TypeChecker): [string, ts.Type][] {
  if (checker.isArrayType(type)) {
    const [element] = checker.getTypeArguments(type as ts.TypeReference)
    return element ? [['*', element]] : []
  }
  const index = type.getStringIndexType()
  const properties = type
    .getProperties()
    .map((property): [string, ts.Type] => [property.getName(), checker.getTypeOfSymbol(property)])
  return index ? [['*', index], ...properties] : properties
}

/** The compiler's name of an anonymous type, such as `{ repository: string; commit: string }`. */
const ANONYMOUS = '__type'

/** Every numbers type below the generated file's root type, with its places; an interface's base
 * stands at the interface's places. */
function numbersPlaces(program: ts.Program): Map<ts.Declaration, NumbersType> {
  const checker = program.getTypeChecker()
  const places = new Map<ts.Declaration, NumbersType>()
  const add = (type: ts.Type, path: string[]): void => {
    const declaration = numbersDeclaration(type)
    if (declaration === undefined) return
    const name = (type.aliasSymbol ?? type.getSymbol())?.getName() ?? ANONYMOUS
    const known = places.get(declaration)
    const label = name === ANONYMOUS ? path.join('.') : name
    if (known) known.paths.push(path)
    else places.set(declaration, { label, paths: [path] })
    const bases = type.isClassOrInterface() ? checker.getBaseTypes(type) : []
    for (const base of bases) add(base, path)
  }
  const walk = (type: ts.Type, path: string[]): void => {
    add(type, path)
    if (path.length >= TYPE_DEPTH) return
    for (const [key, part] of partsOf(type, checker))
      walk(part.getNonNullableType(), [...path, key])
  }
  const file = program.getSourceFile(NUMBERS_FILES[0] as string)
  const exports = file && checker.getSymbolAtLocation(file)?.exports
  const root = exports?.get(ts.escapeLeadingUnderscores('Bw2Numbers'))
  if (root) walk(checker.getDeclaredTypeOfSymbol(root), [])
  return places
}

const wraps = (node: ts.Node) =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node)

/** The node as its parent sees it, outside its parentheses, `as`, `satisfies` and `!`. */
const outermost = (node: ts.Node): ts.Node => (wraps(node.parent) ? outermost(node.parent) : node)

const isLiteral = (node: ts.Node): node is ts.ObjectLiteralExpression | ts.ArrayLiteralExpression =>
  ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)

/** A literal that is no member or element of another literal; the others go with their root. */
function isRoot(node: ts.Node): boolean {
  const { parent } = outermost(node)
  if (ts.isArrayLiteralExpression(parent)) return false
  return !(ts.isPropertyAssignment(parent) && isLiteral(parent.parent))
}

/** An `as` or `satisfies` type that names a type: not `unknown` and not `const`. */
const isWritten = (type: ts.TypeNode) =>
  type.kind !== ts.SyntaxKind.UnknownKeyword &&
  !(ts.isTypeReferenceNode(type) && type.typeName.getText() === 'const')

/** The type a root literal is written as: the outermost `as` or `satisfies` type that names one,
 * else its contextual type. */
function writtenType(node: ts.Expression, checker: ts.TypeChecker): ts.Type | undefined {
  let written: ts.TypeNode | undefined
  for (let current: ts.Node = node; wraps(current.parent); current = current.parent) {
    const { parent } = current
    if ((ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) && isWritten(parent.type)) {
      written = parent.type
    }
  }
  return written ? checker.getTypeFromTypeNode(written) : checker.getContextualType(node)
}

interface Walk {
  readonly checker: ts.TypeChecker
  readonly places: Map<ts.Declaration, NumbersType>
  readonly file: ts.SourceFile
  readonly found: TypedLiteral[]
}

/** Notes a part of a numbers type with its places, unless its value is opaque. */
function note(walk: Walk, node: ts.Expression, numbers: NumbersType, key: string | undefined) {
  const value = plainValue(node, walk.checker)
  if (value === undefined) return
  const start = innerExpression(node).getStart(walk.file)
  const { line } = walk.file.getLineAndCharacterOfPosition(start)
  const file = relative(REPO, walk.file.fileName)
  walk.found.push({ file, line: line + 1, label: numbers.label, paths: numbers.paths, key, value })
}

function walkMembers(walk: Walk, node: ts.ObjectLiteralExpression, type: ts.Type) {
  for (const member of node.properties) {
    if (!ts.isPropertyAssignment(member)) continue
    const key = ts.isComputedPropertyName(member.name) ? undefined : member.name.text
    const property = key === undefined ? undefined : type.getProperty(key)
    const part = property ? walk.checker.getTypeOfSymbol(property) : type.getStringIndexType()
    if (part) walkTyped(walk, member.initializer, part, property ? undefined : key)
  }
}

function walkElements(walk: Walk, node: ts.ArrayLiteralExpression, type: ts.Type) {
  const { checker } = walk
  const isList = checker.isArrayType(type) || checker.isTupleType(type)
  const parts = isList ? checker.getTypeArguments(type as ts.TypeReference) : []
  node.elements.forEach((element, index) => {
    const part = checker.isTupleType(type) ? parts[index] : parts[0]
    if (part && !ts.isSpreadElement(element)) walkTyped(walk, element, part, undefined)
  })
}

/** Walks a literal beside its type, and notes each part of a numbers type. */
function walkTyped(walk: Walk, node: ts.Expression, type: ts.Type, key: string | undefined) {
  const own = type.getNonNullableType()
  const declaration = numbersDeclaration(own)
  const numbers = declaration && walk.places.get(declaration)
  if (numbers) {
    note(walk, node, numbers, key)
    return
  }
  const inner = innerExpression(node)
  if (ts.isObjectLiteralExpression(inner)) walkMembers(walk, inner, own)
  if (ts.isArrayLiteralExpression(inner)) walkElements(walk, inner, own)
}

function walkFile(walk: Walk) {
  const visit = (node: ts.Node): void => {
    const type = isLiteral(node) && isRoot(node) && writtenType(node, walk.checker)
    if (type) walkTyped(walk, node, type, undefined)
    ts.forEachChild(node, visit)
  }
  visit(walk.file)
}

/** Every literal of a numbers type in the given specs of the program. */
export function typedLiterals(program: ts.Program, files: readonly string[]): TypedLiteral[] {
  const checker = program.getTypeChecker()
  const places = numbersPlaces(program)
  const found: TypedLiteral[] = []
  for (const name of files) {
    const file = program.getSourceFile(name)
    if (file === undefined) throw new Error(`The compiler's program lacks the spec ${name}.`)
    walkFile({ checker, places, file, found })
  }
  return found
}

/** The concrete paths of the generated file that a place stands for, each `*` at every key. */
function concretePaths(file: unknown, path: readonly string[]): string[][] {
  const star = path.indexOf('*')
  if (star < 0) return at(file, path) === undefined ? [] : [[...path]]
  const head = path.slice(0, star)
  const part = at(file, head)
  const keys = isObject(part) ? Object.keys(part) : []
  return keys.flatMap((key) => concretePaths(file, [...head, key, ...path.slice(star + 1)]))
}

/** The places of the generated file a literal can stand at: by its record key, then by the
 * `name` it carries, as a symbol does. */
function placesOf(literal: TypedLiteral, file: unknown): string[][] {
  const { key, value } = literal
  const written =
    key === undefined
      ? literal.paths
      : literal.paths
          .filter((path) => path.at(-1) === '*')
          .map((path) => [...path.slice(0, -1), key])
  const paths = written.flatMap((path) => concretePaths(file, path))
  const name = isObject(value) ? value.name : undefined
  if (typeof name !== 'string') return paths
  return paths.filter((path) => {
    const real = at(file, path)
    return !isObject(real) || typeof real.name !== 'string' || real.name === name
  })
}

/** Each member of a literal that equals the generated file: by the guard's rules at its one place,
 * and without the values from 0 to 3 where several places remain. */
export function literalFindings(
  literals: readonly TypedLiteral[],
  file: unknown,
): LiteralFinding[] {
  return literals.flatMap((literal) => {
    const paths = placesOf(literal, file)
    const [only] = paths
    const names =
      paths.length === 1 && only
        ? namesAt(literal.value, file, only, literal.label)
        : paths.flatMap((path) => equalNames(literal.value, at(file, path), literal.label, false))
    return [...new Set(names)].map((name) => ({ file: literal.file, line: literal.line, name }))
  })
}
