import { describe, expect, it } from 'vitest'

import { listConstants, saveTrainer, trainerMatches, trainerScriptOffset } from './gen5-bw2-trainer'

// Every name and number below is invented: a list of an invented region's trainers in the form of
// pokebw2's generated lists, a C file with the two functions that tie a trainer to his script, and
// an events file of an invented route.
const TRAINERS = `# Trainers of an invented region, by class and name
TRAINER_NOBODY = 5
TRAINER_TESTER_ANNA
TRAINER_TESTER_BEN

TRAINER_GUARD_CARL = 0x20 # a comment after a value
TRAINER_GUARD_DORA
`

const SCRIPT_C = `#include "field/script/trainer_script.h"

// GetNormalSCRIDFromTrainerID is declared in the header; its body follows here.
u16 GetNPCTrainerIDFromSCRID(u32 scriptId) {
    if (scriptId < 0x900) {
        return scriptId - 0x700;
    }
    return scriptId - 0x900;
}

u16 GetNormalSCRIDFromTrainerID(u32 trainerId) {
    return trainerId + 0x700;
}
`

const TRAINER = 'ACTOR_EVENT_TYPE_TRAINER'

/** Ben's script is 0x707, Anna's 0x706. A plain NPC shares Ben's script, and Carl's script lies
 * on no NPC. */
const EVENTS = JSON.stringify({
  bg_events: [],
  npcs: [
    { id: 1, type: TRAINER, script: 0x706, grid: { x: 30, z: 300, y: 1 } },
    { id: 2, type: 'ACTOR_EVENT_TYPE_NORMAL', script: 0x707, grid: { x: 31, z: 301, y: 1 } },
    { id: 3, type: TRAINER, script: 0x707, grid: { x: 40, z: 310, y: 1 } },
  ],
  warps: [],
  triggers: [],
  init_scripts: [],
})

const sources = (events = EVENTS) => ({ events, trainers: TRAINERS, script: SCRIPT_C })

describe('listConstants', () => {
  it('numbers each name one past the last, or by its own value', () => {
    expect(listConstants(TRAINERS)).toEqual({
      TRAINER_NOBODY: 5,
      TRAINER_TESTER_ANNA: 6,
      TRAINER_TESTER_BEN: 7,
      TRAINER_GUARD_CARL: 32,
      TRAINER_GUARD_DORA: 33,
    })
  })

  it('throws for a name twice or a line that is no name', () => {
    expect(() => listConstants('TRAINER_A\nTRAINER_A\n')).toThrow('TRAINER_A')
    expect(() => listConstants('TRAINER A\n')).toThrow('TRAINER A')
    expect(() => listConstants('TRAINER_A = many\n')).toThrow('TRAINER_A')
  })
})

describe('trainerScriptOffset', () => {
  it("reads what GetNormalSCRIDFromTrainerID adds to the trainer's number", () => {
    expect(trainerScriptOffset(SCRIPT_C)).toBe(0x700)
  })

  it('throws for a body of another form', () => {
    const other = SCRIPT_C.replace('trainerId + 0x700', 'trainerId * 2')
    expect(() => trainerScriptOffset(other)).toThrow('GetNormalSCRIDFromTrainerID')
  })
})

// Scene: the save's trainer is found by his name, through the script his trainer number gives.
describe('saveTrainer', () => {
  it('finds the trainer NPC whose script his trainer number gives, and returns his tile', () => {
    expect(saveTrainer(sources(), 'TRAINER_TESTER_BEN')).toEqual({ x: 40, z: 310 })
    expect(saveTrainer(sources(), 'TRAINER_TESTER_ANNA')).toEqual({ x: 30, z: 300 })
  })

  it('counts only NPCs of the trainer type', () => {
    expect(trainerMatches(EVENTS, 0x707).map(({ id }) => id)).toEqual([3])
  })

  it('throws for a name the list does not hold', () => {
    expect(() => saveTrainer(sources(), 'TRAINER_MISSING')).toThrow(
      'the list of trainers lacks TRAINER_MISSING',
    )
  })

  it('throws when no NPC or two carry his script, naming him', () => {
    expect(() => saveTrainer(sources(), 'TRAINER_GUARD_CARL')).toThrow('TRAINER_GUARD_CARL')
    const twice = JSON.stringify({
      ...JSON.parse(EVENTS),
      npcs: [
        { id: 3, type: TRAINER, script: 0x707, grid: { x: 40, z: 310, y: 1 } },
        { id: 4, type: TRAINER, script: 0x707, grid: { x: 41, z: 310, y: 1 } },
      ],
    })
    expect(() => saveTrainer(sources(twice), 'TRAINER_TESTER_BEN')).toThrow('TRAINER_TESTER_BEN')
  })

  it('throws for an events file without NPCs', () => {
    expect(() => saveTrainer(sources('{"triggers": []}'), 'TRAINER_TESTER_BEN')).toThrow('npcs')
  })
})
