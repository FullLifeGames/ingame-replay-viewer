// The plain value of a literal that a spec writes, for the typed-literal check
// (scripts/gen5-literals.ts): numbers and constant expressions of them, strings, object and array
// literals, and an identifier or a shorthand member bound to a const of the same file. Spreads,
// calls and imports stay opaque and drop out: an import from a *.fixtures.ts module is the
// fixtures' guard's, and a helper's call returns a literal that the walk meets as its own root.
import ts from 'typescript'

type Operator = (a: number, b: number) => number

/** The binary operators of a constant expression. */
const BINARY = new Map<ts.SyntaxKind, Operator>([
  [ts.SyntaxKind.LessThanLessThanToken, (a, b) => a << b],
  [ts.SyntaxKind.GreaterThanGreaterThanToken, (a, b) => a >> b],
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, (a, b) => a >>> b],
  [ts.SyntaxKind.BarToken, (a, b) => a | b],
  [ts.SyntaxKind.AmpersandToken, (a, b) => a & b],
  [ts.SyntaxKind.CaretToken, (a, b) => a ^ b],
  [ts.SyntaxKind.PlusToken, (a, b) => a + b],
  [ts.SyntaxKind.MinusToken, (a, b) => a - b],
  [ts.SyntaxKind.AsteriskToken, (a, b) => a * b],
])

/** The unary operators of a constant expression. */
const UNARY = new Map<ts.SyntaxKind, (a: number) => number>([
  [ts.SyntaxKind.MinusToken, (a) => -a],
  [ts.SyntaxKind.PlusToken, (a) => a],
  [ts.SyntaxKind.TildeToken, (a) => ~a],
])

/** The expression inside its parentheses, `as`, `satisfies` and `!`. */
export function innerExpression(node: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return innerExpression(node.expression)
  }
  return node
}

/** The initializer of a const declared in the same file as `from`, or undefined. */
function constInitializer(symbol: ts.Symbol | undefined, from: ts.Node) {
  const declaration = symbol?.valueDeclaration
  if (declaration === undefined || !ts.isVariableDeclaration(declaration)) return undefined
  if (declaration.getSourceFile() !== from.getSourceFile()) return undefined
  const isConst = (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0
  return isConst ? declaration.initializer : undefined
}

/** A member's key as the object holds it, or undefined for a computed one. */
function keyOf(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return undefined
}

function objectValue(node: ts.ObjectLiteralExpression, checker: ts.TypeChecker) {
  const entries = node.properties.flatMap((member): [string, unknown][] => {
    if (ts.isShorthandPropertyAssignment(member)) {
      const symbol = checker.getShorthandAssignmentValueSymbol(member)
      const initializer = constInitializer(symbol, member)
      return initializer ? [[member.name.text, plainValue(initializer, checker)]] : []
    }
    const key = ts.isPropertyAssignment(member) ? keyOf(member.name) : undefined
    if (key === undefined || !ts.isPropertyAssignment(member)) return []
    return [[key, plainValue(member.initializer, checker)]]
  })
  return Object.fromEntries(entries)
}

/** The elements before the first spread, whose indices the literal fixes. */
function arrayValue(node: ts.ArrayLiteralExpression, checker: ts.TypeChecker) {
  const spread = node.elements.findIndex((element) => ts.isSpreadElement(element))
  const fixed = spread < 0 ? node.elements : node.elements.slice(0, spread)
  return fixed.map((element) => plainValue(element, checker))
}

function numberOf(node: ts.Expression, checker: ts.TypeChecker) {
  const value = plainValue(node, checker)
  return typeof value === 'number' ? value : undefined
}

/** A number literal, or an operator over constant numbers. */
function computed(node: ts.Expression, checker: ts.TypeChecker): number | undefined {
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = numberOf(node.operand, checker)
    const operator = UNARY.get(node.operator)
    return operand === undefined || operator === undefined ? undefined : operator(operand)
  }
  if (!ts.isBinaryExpression(node)) return undefined
  const operator = BINARY.get(node.operatorToken.kind)
  const a = numberOf(node.left, checker)
  const b = numberOf(node.right, checker)
  return operator === undefined || a === undefined || b === undefined ? undefined : operator(a, b)
}

/** The plain value a literal writes, or undefined where it is opaque. */
export function plainValue(node: ts.Expression, checker: ts.TypeChecker): unknown {
  const inner = innerExpression(node)
  if (ts.isObjectLiteralExpression(inner)) return objectValue(inner, checker)
  if (ts.isArrayLiteralExpression(inner)) return arrayValue(inner, checker)
  if (ts.isStringLiteralLike(inner)) return inner.text
  if (ts.isIdentifier(inner)) {
    const initializer = constInitializer(checker.getSymbolAtLocation(inner), inner)
    return initializer ? plainValue(initializer, checker) : undefined
  }
  return computed(inner, checker)
}
