// The derivation table's completeness (#138): every exported function of src/gen5/ and
// scripts/gen5-* that takes pokebw2's numbers and gives a check, a ref, a write, a step or a run
// plan must stand in the table (scripts/gen5-derived-table.ts) or below with its reason, as every
// fixtures module must stand in the fixtures' guard. A new derive function cannot slip past the
// derivations' check this way. The compiler's program is the typed-literal check's.
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import type ts from 'typescript'

import { numbersDeclaration, partsOf } from './gen5-literals.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const REPO = GEN5_PATHS.repo

/** The types of a plan: a function that gives one of them derives what the game reads. */
const PLAN_TYPES = new Set(['RamCheck', 'RamRef', 'MemoryWrite', 'MacroStep', 'RunPlan'])

/** How deep the walk into a return type goes, as `{ plan: { steps: MacroStep[] } }`. */
const PLAN_DEPTH = 3

/** A module of code, no spec and no fixtures module. */
const isCode = (file: string) =>
  file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.fixtures.ts')

/** The code modules of src/gen5/ and the scripts' gen5-* modules, by absolute path. */
export const codeFiles = (): string[] => [
  ...readdirSync(join(REPO, 'src/gen5'), { recursive: true, encoding: 'utf8' })
    .filter(isCode)
    .map((file) => join(REPO, 'src/gen5', file)),
  ...readdirSync(join(REPO, 'scripts'))
    .filter((file) => file.startsWith('gen5-') && isCode(file))
    .map((file) => join(REPO, 'scripts', file)),
]

/** Whether a type is a numbers type, or an object type with one as a member. */
function holdsNumbers(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (numbersDeclaration(type)) return true
  if (type.isUnion()) return type.types.some((part) => holdsNumbers(part, checker))
  return partsOf(type, checker).some(([, part]) => numbersDeclaration(part) !== undefined)
}

const nameOf = (type: ts.Type) => type.aliasSymbol?.getName() ?? type.getSymbol()?.getName()

/** Whether a type is or holds a plan type, `depth` levels down. */
function holdsPlan(type: ts.Type, checker: ts.TypeChecker, depth = PLAN_DEPTH): boolean {
  const name = nameOf(type)
  if (name !== undefined && PLAN_TYPES.has(name)) return true
  if (depth === 0) return false
  if (type.isUnion()) return type.types.some((part) => holdsPlan(part, checker, depth))
  return partsOf(type, checker).some(([, part]) => holdsPlan(part, checker, depth - 1))
}

/** Whether a call signature takes the numbers and gives a plan. */
function derives(signature: ts.Signature, checker: ts.TypeChecker): boolean {
  const takes = signature.getParameters().some((parameter) => {
    return holdsNumbers(checker.getTypeOfSymbol(parameter), checker)
  })
  return takes && holdsPlan(signature.getReturnType(), checker)
}

/** Every exported function of `files` that derives a plan from the numbers, as `file name`. */
export function derivingFunctions(program: ts.Program, files: readonly string[]): string[] {
  const checker = program.getTypeChecker()
  return files.flatMap((file) => {
    const source = program.getSourceFile(file)
    const module = source && checker.getSymbolAtLocation(source)
    if (!module) return []
    return checker
      .getExportsOfModule(module)
      .filter((symbol) =>
        checker
          .getTypeOfSymbol(symbol)
          .getCallSignatures()
          .some((signature) => derives(signature, checker)),
      )
      .map((symbol) => `${relative(REPO, file)} ${symbol.getName()}`)
  })
}

/** The derive functions that the table runs through another row or that need no row, each with
 * its reason. */
export const NOT_DERIVED: Readonly<Record<string, string>> = {
  'src/gen5/direct-takeover.ts stageRef':
    "the stage word of the routine's block, which takeover(ENTRY)'s row watches and checks",
  'src/gen5/replay-plan.ts replayEntry':
    "directEntry on the replay's sealed parties: the directEntry row runs the plan, and the " +
    'sealing gives bytes, which the check leaves out',
  'src/gen5/replay-run.ts entryRun':
    "replayEntry with battleRefs' checks and watch: the directEntry and battleRefs rows run both",
  'src/gen5/replay-run.ts playRun':
    "replayPlan with battleRefs' watch: the replayPlan and battleRefs rows run both",
  'scripts/gen5-moment-args.ts firstRun':
    "continueRoute with the refs it is handed, or a state's wait: the continueRoute row runs it",
  'scripts/gen5-moment-blocks.ts blocksScene':
    'replayPlan at the adapter that the run reads: the replayPlan row runs the plan',
  'scripts/gen5-moment-direct.ts sessionPlan':
    'firstRun or directEntry with the parties it is handed: the rows of both run them',
  'scripts/gen5-moment-plan.ts momentSteps':
    "menuSteps and blockSteps on a moment's commands: the replayPlan row runs both",
  'scripts/gen5-moment-session.ts watchOf':
    "battleRefs' watch and the server's and front Pokémon's words behind the run's readings; no " +
    'spec runs it on a fixture, so no tracked number derives from it',
}
