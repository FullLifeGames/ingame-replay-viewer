// Which battle client and which setup index is the player's and which the opponent's (#93), from
// pokebw2 at its pin. The single battle's setup (BtlMain_SetupAloneSingle) creates each client
// with BattleClient_Create, whose `clientId` names the client and whose `isAI` tells the
// opponent's from the player's. The trainer battle's setup (BtlSetup_SetTrainer1v1Single) loads
// the trainer at its `client` in the setup's per-client arrays, and BtlSetup_LoadPlayerParty and
// BtlSetup_LoadGameData put the player's party and info at the player's. Part of
// build/gen5/bw2.json; the errors name roles and show no number.
import type { Sides } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, literal, stripComments } from './gen5-bw2-c.ts'

const SINGLE_SETUP = 'BtlMain_SetupAloneSingle'
const CREATE = 'BattleClient_Create'
const TRAINER_SETUP = 'BtlSetup_SetTrainer1v1Single'
const LOAD_TRAINER = 'BtlSetup_LoadTrainer'
const LOAD_PARTY = 'BtlSetup_LoadPlayerParty'
const LOAD_GAME_DATA = 'BtlSetup_LoadGameData'

function number(text: string | undefined, what: string): number {
  const found = text === undefined ? undefined : literal(text)
  if (found === undefined) throw new Error(`${what} is "${String(text)}", no number`)
  return found
}

/** The text inside the parentheses that open at `open`, split at the commas outside nested
 * parentheses and brackets. */
function argsAt(text: string, open: number): string[] {
  const args: string[] = []
  let depth = 0
  let start = open + 1
  for (let i = open; i < text.length; i += 1) {
    const char = text[i] ?? ''
    if ('([{'.includes(char)) depth += 1
    if (')]}'.includes(char)) depth -= 1
    if (depth === 0) return [...args, text.slice(start, i).trim()]
    if (depth === 1 && char === ',') {
      args.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  throw new Error(`the parenthesis at ${String(open)} is never closed`)
}

/** The arguments of every call of `fn` in `text`, a declaration's parameters among them. */
const callsOf = (text: string, fn: string): string[][] =>
  [...text.matchAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'))].map((match) =>
    argsAt(text, match.index + match[0].length - 1),
  )

/** The parameter names of the first declaration of `fn`: the one whose every parameter has a
 * type before its name. */
function paramNames(source: string, fn: string): string[] {
  const declared = callsOf(source, fn).find((params) =>
    params.every((param) => /[\w*]\s*[\s*]\s*\w+$/.test(param)),
  )
  if (declared === undefined) throw new Error(`no declaration of ${fn} names its parameters`)
  return declared.map((param) => /(\w+)$/.exec(param)?.[1] ?? '')
}

function paramIndex(names: readonly string[], fn: string, name: string): number {
  const at = names.indexOf(name)
  if (at < 0) throw new Error(`${fn} has no parameter ${name}`)
  return at
}

/** The one side whose `isAI` is `ai`; throws when the setup creates none or more than one. */
function oneClient(created: readonly { client: number; ai: boolean }[], ai: boolean): number {
  const found = created.filter((entry) => entry.ai === ai)
  const [first] = found
  if (found.length !== 1 || first === undefined) {
    const role = ai ? "the opponent's" : "the player's"
    throw new Error(`${SINGLE_SETUP} creates ${String(found.length)} clients as ${role}, not one`)
  }
  return first.client
}

const CLIENT_SLOT = new RegExp(`\\bclients\\[([^\\]]+)\\]\\s*=\\s*${CREATE}\\s*\\(`, 'g')

/** The player's client and the opponent's, as the single battle's setup creates them: each at
 * its own slot of the main module's clients, the player's not the AI. */
export function singleClients(mainC: string, clientH: string): Sides {
  const names = paramNames(stripComments(clientH), CREATE)
  const id = paramIndex(names, CREATE, 'clientId')
  const ai = paramIndex(names, CREATE, 'isAI')
  const body = stripComments(bodyOf(mainC, `${SINGLE_SETUP}(`))
  const created = [...body.matchAll(CLIENT_SLOT)].map((match) => {
    const args = argsAt(body, match.index + match[0].length - 1)
    const client = number(args[id], `${CREATE}'s clientId`)
    if (number(match[1], 'a client slot') !== client) {
      throw new Error(`${SINGLE_SETUP} puts a client at another client's slot`)
    }
    return { client, ai: number(args[ai], `${CREATE}'s isAI`) !== 0 }
  })
  return { player: oneClient(created, false), opponent: oneClient(created, true) }
}

/** The index of the one assignment `pattern` matches in `fn`'s body. */
function onlyIndex(source: string, fn: string, pattern: RegExp, what: string): number {
  const found = [...bodyOf(source, `${fn}(`).matchAll(pattern)]
  const [first] = found
  if (found.length !== 1 || first === undefined) {
    throw new Error(`${fn} sets ${what} ${String(found.length)} times, not once`)
  }
  return number(first[1], what)
}

/** The opponent's index in the trainer battle's setup: the `client` it loads the trainer at,
 * whose element of `party` it loads the trainer's party into. */
function trainerIndex(source: string): number {
  const names = paramNames(source, LOAD_TRAINER)
  const calls = callsOf(bodyOf(source, `${TRAINER_SETUP}(`), LOAD_TRAINER)
  const [args] = calls
  if (calls.length !== 1 || args === undefined) {
    throw new Error(
      `${TRAINER_SETUP} calls ${LOAD_TRAINER} ${String(calls.length)} times, not once`,
    )
  }
  const client = number(args[paramIndex(names, LOAD_TRAINER, 'client')], `${LOAD_TRAINER}'s client`)
  const party = args[paramIndex(names, LOAD_TRAINER, 'party')] ?? ''
  const element = /^&\s*\w+->party\[([^\]]+)\]$/.exec(party)?.[1]
  if (number(element, `${LOAD_TRAINER}'s party`) !== client) {
    throw new Error(`${TRAINER_SETUP} loads the trainer's party outside its client's element`)
  }
  return client
}

/** Each side's index in the setup's per-client arrays (party, playerInfo, trainers), as the
 * trainer battle's setup fills them. */
export function setupIndices(setupC: string): Sides {
  const source = stripComments(setupC)
  const opponent = trainerIndex(source)
  const party = /\b\w+->party\[([^\]]+)\]\s*=(?!=)/g
  const player = onlyIndex(source, LOAD_PARTY, party, "the player's party")
  const info = /\b\w+->playerInfo\[([^\]]+)\]\s*=\s*GetGameDataPlayerInfo\s*\(/g
  if (onlyIndex(source, LOAD_GAME_DATA, info, "the player's info") !== player) {
    throw new Error(`${LOAD_GAME_DATA} puts the player's info outside the player's party element`)
  }
  if (player === opponent) throw new Error("the setup puts the trainer at the player's element")
  return { player, opponent }
}

/** Throws unless the player's client is the one the setup names as the player's
 * (`fieldSituation.playerClientId` in BtlSetup_LoadGameData), which the battle takes over. */
export function checkPlayerClient(clients: Sides, setupC: string): void {
  const named = /\bfieldSituation\.playerClientId\s*=\s*([^;]+);/g
  const id = onlyIndex(stripComments(setupC), LOAD_GAME_DATA, named, 'playerClientId')
  if (id !== clients.player) {
    throw new Error(
      `the setup's playerClientId is not the client ${SINGLE_SETUP} creates as the player's`,
    )
  }
}
