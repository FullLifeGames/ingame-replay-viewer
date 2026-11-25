import { describe, expect, it } from 'vitest'

import { firstMessage, placeMatches, reaches, type RouteKeys, routePlaces } from './gen5-bw2-field'

// A written field script of an invented town, in pokebw2's form: labels, statements, comments and
// a little data. Script_901 calls its greeting over a jump that the walk does not take.
const SCRIPT = `#include "asm/field_script.inc"
#include "text/script/testville.h"

    ScriptEntry Script_901
    ScriptEntry Script_902
    ScriptEntry Script_903
    ScriptEntry Script_904
    ScriptEntriesEnd

Script_901:
    ActorsPauseAll
    VMJumpIf CMP_EQ, L_NotTaken
    VMCall L_Greeting
    VMJump L_Done

L_NotTaken:
    ActorMsg MSGFILE_SCRIPT, Testville_Text_NeverShown, 0, 0, 0
    CallTrainerBattle TRAINER_TESTER_2, 0, 1
    VMHalt

L_Greeting:
    // "Hello, tester!"
    ActorMsg MSGFILE_SCRIPT, Testville_Text_HelloTester, 0, 0, 0
    VMJumpIf CMP_STACK, L_NotTaken
    CallTrainerBattle TRAINER_TESTER, 0, 1
    VMReturn

L_Done:
    FinishAllEvents
    VMHalt

Script_902:
    SEPlay SEQ_SE_MESSAGE
    SystemMsg Testville_Text_ASignReads, 1
    VMHalt

Script_903:
    VMJump L_Wait

L_Wait:
    VMSleep 1
    VMJump L_Wait

Script_904:
    ParentActorMsg MSGFILE_SCRIPT, Testville_Text_HelloTester, 0, 0
    VMHalt

Movement_Tester:
    Move 12, 1
    MoveEnd
`

/** A written events file: the triggers in another order than their scripts, and an NPC whose
 * script lies in another file. */
const EVENTS = JSON.stringify({
  bg_events: [],
  npcs: [
    { id: 0, script: 9001, grid: { x: 70, z: 70, y: 1 } },
    { id: 1, script: 902, grid: { x: 11, z: 101, y: 1 } },
  ],
  warps: [],
  triggers: [
    { script: 903, var: 'INVENTED_VAR', value: 1, grid: { x: 20, z: 200, width: 5, y: 1 } },
    { script: 901, var: 'INVENTED_VAR', value: 0, grid: { x: 10, z: 100, width: 5, y: 1 } },
  ],
  init_scripts: [],
})

const KEYS: RouteKeys = {
  hughTrigger: { firstLine: 'Testville_Text_HelloTester' },
  battleTrigger: {
    firstLine: 'Testville_Text_HelloTester',
    reaches: 'CallTrainerBattle TRAINER_TESTER',
  },
  outlookTrigger: { firstLine: 'Testville_Text_HelloTester' },
  bianca: { firstLine: 'Testville_Text_ASignReads' },
}

// Scene: a trigger is found by the line its script shows first, not by its number.
describe('firstMessage', () => {
  it('walks into a call and over a conditional jump to the first line shown', () => {
    expect(firstMessage(SCRIPT, 'Script_901')).toBe('Testville_Text_HelloTester')
  })

  it("takes a line from any message statement, not only an actor's", () => {
    expect(firstMessage(SCRIPT, 'Script_902')).toBe('Testville_Text_ASignReads')
    expect(firstMessage(SCRIPT, 'Script_904')).toBe('Testville_Text_HelloTester')
  })

  it('ends on a path that loops without a line', () => {
    expect(firstMessage(SCRIPT, 'Script_903')).toBeUndefined()
  })

  it('throws for a label the file does not hold', () => {
    expect(() => firstMessage(SCRIPT, 'Script_999')).toThrow('Script_999')
  })
})

describe('reaches', () => {
  it('finds a statement on the path, by its command and leading arguments', () => {
    expect(reaches(SCRIPT, 'Script_901', 'CallTrainerBattle TRAINER_TESTER')).toBe(true)
    expect(reaches(SCRIPT, 'Script_901', 'CallTrainerBattle')).toBe(true)
  })

  it('misses a statement behind a jump the walk does not take', () => {
    expect(reaches(SCRIPT, 'Script_901', 'CallTrainerBattle TRAINER_TESTER_2')).toBe(false)
    expect(reaches(SCRIPT, 'Script_903', 'CallTrainerBattle')).toBe(false)
  })
})

// Scene: the route's places come from the events whose scripts show the keys' lines.
describe('routePlaces', () => {
  const keys = (bianca: string, battle = KEYS.battleTrigger): RouteKeys => ({
    ...KEYS,
    battleTrigger: battle,
    bianca: { firstLine: bianca },
  })

  it("picks each place by its script's first line, a trigger with its strip", () => {
    expect(routePlaces(EVENTS, SCRIPT, KEYS)).toEqual({
      hughTrigger: { x: 10, z: 100, width: 5 },
      battleTrigger: { x: 10, z: 100, width: 5 },
      outlookTrigger: { x: 10, z: 100, width: 5 },
      bianca: { x: 11, z: 101 },
    })
  })

  it('counts the events that match each key', () => {
    const counts = Object.entries(placeMatches(EVENTS, SCRIPT, keys('Testville_Text_Nobody')))
    expect(counts.map(([name, hits]) => [name, hits.length])).toEqual([
      ['hughTrigger', 1],
      ['battleTrigger', 1],
      ['outlookTrigger', 1],
      ['bianca', 0],
    ])
  })

  it('throws for a key that no event matches, naming the place', () => {
    expect(() => routePlaces(EVENTS, SCRIPT, keys('Testville_Text_Nobody'))).toThrow('bianca')
    const battle = { firstLine: 'Testville_Text_HelloTester', reaches: 'CallTrainerBattle X' }
    expect(() => routePlaces(EVENTS, SCRIPT, keys(KEYS.bianca.firstLine, battle))).toThrow(
      'battleTrigger',
    )
  })

  it('throws for two events with the same first line', () => {
    const twice = JSON.stringify({
      ...JSON.parse(EVENTS),
      npcs: [
        { id: 1, script: 902, grid: { x: 11, z: 101, y: 1 } },
        { id: 2, script: 902, grid: { x: 12, z: 101, y: 1 } },
      ],
    })
    expect(() => routePlaces(twice, SCRIPT, KEYS)).toThrow('bianca')
  })

  it('throws for an events file without triggers or NPCs', () => {
    expect(() => routePlaces('{"npcs": []}', SCRIPT, KEYS)).toThrow('triggers')
  })
})
