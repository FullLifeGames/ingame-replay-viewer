// The streams of the screenshot run: a test replay's stream from the Gen 3 game backend, a
// hand-made battle written with the stream encoder, the same stream with version 2, and the decoder
// that turns the bytes back into instructions for the scene points. src/gen3/ imports without file
// extensions and imports JSON, as the page's bundler resolves them, so scripts/rom-shot.ts loads
// this module through Vite's module runner, not with plain Node.
import { buildGen3Stream } from '../src/gen3/backend.ts'
import { decodeStream } from '../src/gen3/stream/decode.ts'
import { encodeStream } from '../src/gen3/stream/encode.ts'
import { STREAM_OFFSET } from '../src/gen3/stream/format.ts'
import type { Instruction, Stream, StreamMon } from '../src/gen3/stream/instructions.ts'
import { moveOf, speciesOf } from '../src/gen3/tables/lookup.ts'
import trainerPics from '../src/gen3/tables/trainer-pics.json'
import { buildBattleScript } from '../src/script/build.ts'
import { readReplay } from '../src/script/replay.ts'

export { decodeStream }

/** The stream of a replay as Showdown saves it, through the battle script and the game backend. */
export function replayBytes(json: unknown): Uint8Array {
  return buildGen3Stream(buildBattleScript(readReplay(json).log)).bytes
}

function monOf(name: string, gender: StreamMon['gender']): StreamMon {
  const species = speciesOf(name)
  return { species: species.number, maxHp: 100, level: 100, gender, shiny: false, nickname: name }
}

const move = (name: string) => moveOf(name).number

// One short battle with every scene the screenshot run checks: the intro, both ball displays, both
// send-outs, a move with its hit and HP change, a status, a switch, a faint and the win line. The
// near team has one unrevealed member, so its display shows three balls; the far one shows one ball
// and five empty slots.
const INSTRUCTIONS: readonly Instruction[] = [
  { op: 'intro' },
  { op: 'print', text: 'Bob would like to battle!' },
  { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
  { op: 'print', text: 'Bob sent out Skarmory!' },
  { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
  { op: 'print', text: 'Go! Dugtrio!' },
  { op: 'turn', number: 1 },
  { op: 'print', text: 'Dugtrio used Rock Slide!' },
  { op: 'move', user: 'near', target: 'far', move: move('Rock Slide') },
  { op: 'hit', side: 'far', effectiveness: 'resisted' },
  { op: 'hp', side: 'far', hp: 71 },
  { op: 'print', text: 'It’s not very effective…' },
  { op: 'print', text: 'Foe Skarmory used Toxic!' },
  { op: 'move', user: 'far', target: 'near', move: move('Toxic') },
  { op: 'anim', side: 'near', anim: 'statusPsn' },
  { op: 'status', side: 'near', slot: 0, status: 'tox' },
  { op: 'print', text: 'Dugtrio was badly poisoned!' },
  { op: 'turn', number: 2 },
  { op: 'print', text: 'Dugtrio, come back!' },
  { op: 'withdraw', side: 'near' },
  { op: 'switchIn', side: 'near', slot: 1, hp: 100, status: 'none' },
  { op: 'print', text: 'Go! Magneton!' },
  { op: 'print', text: 'Magneton used Thunderbolt!' },
  { op: 'move', user: 'near', target: 'far', move: move('Thunderbolt') },
  { op: 'hit', side: 'far', effectiveness: 'super' },
  { op: 'hp', side: 'far', hp: 0 },
  { op: 'print', text: 'It’s super effective!' },
  { op: 'faint', side: 'far' },
  { op: 'print', text: 'Foe Skarmory fainted!' },
  { op: 'print', text: 'Alice won the battle!' },
  { op: 'end', outcome: 'nearWon' },
]

export function handMadeStream(): Stream {
  return {
    trainers: {
      near: {
        name: 'Alice',
        trainerPic: trainerPics.TRAINER_PIC_BRENDAN,
        teamSize: 3,
        revealed: 2,
      },
      far: { name: 'Bob', trainerPic: trainerPics.TRAINER_PIC_MAY, teamSize: 1, revealed: 1 },
    },
    parties: {
      near: [monOf('Dugtrio', 'male'), monOf('Magneton', 'none'), null, null, null, null],
      far: [monOf('Skarmory', 'female'), null, null, null, null, null],
    },
    instructions: INSTRUCTIONS,
  }
}

export function handMadeBytes(): Uint8Array {
  return encodeStream(handMadeStream())
}

/** The same stream with version 2 in its header, which the ROM interpreter refuses. */
export function withVersion(bytes: Uint8Array, version: number): Uint8Array {
  const copy = bytes.slice()
  new DataView(copy.buffer).setUint16(STREAM_OFFSET.version, version, true)
  return copy
}
