// Finds the trainer of the shipped save (#78, Youngster Terrell on Route 20) in pokebw2 by names:
// his constant's number in the generated list of trainers, the script number that
// GetNormalSCRIDFromTrainerID (src/field/script/trainer_script.c) gives that trainer, and the one
// NPC of the trainer type in the route's events that runs that script. Every number comes from the
// listed files at run time; a name the list lacks, or a script on no NPC or on more than one,
// stops the generator.
import type { ActorPlace } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, literal, stripComments } from './gen5-bw2-c.ts'

/** The files that tie the save's trainer to his NPC entry, and his constant's name. */
export const SAVE_TRAINER = {
  events: 'res/field/events/route_20.json',
  trainers: 'generated/trainers.txt',
  script: 'src/field/script/trainer_script.c',
  trainer: 'TRAINER_YOUNGSTER_TERRELL',
}

/** The texts of the files in SAVE_TRAINER, by role. */
export interface TrainerSources {
  events: string
  trainers: string
  script: string
}

const NAME = /^[A-Za-z_]\w*$/

/** The constants of one of pokebw2's generated lists, by name, as its tools/data/gen_constants.py
 * reads them: each line a name, one past the last value, or `NAME = value`; `#` starts a
 * comment. */
export function listConstants(text: string): Record<string, number> {
  const constants: Record<string, number> = {}
  let value = -1
  for (const raw of text.split('\n')) {
    const line = (raw.split('#', 1)[0] ?? '').trim()
    if (line === '') continue
    const [name = '', given] = line.split('=').map((part) => part.trim())
    const number = given === undefined ? value + 1 : literal(given)
    if (!NAME.test(name) || number === undefined) {
      throw new Error(`the list's line of ${name} holds no name or no number`)
    }
    if (name in constants) throw new Error(`${name} stands twice in the list`)
    constants[name] = number
    value = number
  }
  return constants
}

const NORMAL_SCRIPT = 'GetNormalSCRIDFromTrainerID'

/** What GetNormalSCRIDFromTrainerID adds to a trainer's number to give his script's number. */
export function trainerScriptOffset(source: string): number {
  const body = bodyOf(stripComments(source), `${NORMAL_SCRIPT}(`).trim()
  const offset = /^return\s+\w+\s*\+\s*(\w+)\s*;$/.exec(body)?.[1]
  const value = offset === undefined ? undefined : literal(offset)
  if (value === undefined) throw new Error(`${NORMAL_SCRIPT} is not "return <id> + <number>;"`)
  return value
}

/** One NPC of the events file: its number, type, script, direction and tile. */
interface MapNpc {
  id: number
  type: string
  script: number
  direction?: string
  grid: { x: number; z: number }
}

/** The type of an NPC that the game runs as a trainer with a sight line. */
const TRAINER_TYPE = 'ACTOR_EVENT_TYPE_TRAINER'

/** The NPCs of the trainer type in the events file that run the script `script`. */
export function trainerMatches(eventsText: string, script: number): MapNpc[] {
  const { npcs } = JSON.parse(eventsText) as { npcs?: MapNpc[] }
  if (!Array.isArray(npcs)) throw new Error('the events file lacks its npcs')
  return npcs.filter((npc) => npc.type === TRAINER_TYPE && npc.script === script)
}

/** The tile of the trainer `trainer` (a constant of the list) in the events; throws unless
 * exactly one trainer NPC runs his script. */
export function saveTrainer(
  sources: TrainerSources,
  trainer: string = SAVE_TRAINER.trainer,
): ActorPlace {
  const id = listConstants(sources.trainers)[trainer]
  if (id === undefined) throw new Error(`the list of trainers lacks ${trainer}`)
  const hits = trainerMatches(sources.events, id + trainerScriptOffset(sources.script))
  const [only] = hits
  if (only === undefined || hits.length > 1) {
    throw new Error(`${trainer}: ${String(hits.length)} trainer NPCs run his script, not one`)
  }
  return { x: only.grid.x, z: only.grid.z }
}
