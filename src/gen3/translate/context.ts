// What the translation knows while it walks the battle script (plan §6): the trainers, the names
// of the team members, the active Pokémon, and the output with its fallbacks. Handlers read and
// write it; the rules of each scene live in their own modules.
import type { BattleScript, ScriptEvent } from '../../script/events'
import type { PokemonRef, Side } from '../../script/types'
import { Gen3Error } from '../errors'
import type { Fallback, Noted } from '../fallbacks'
import type { Instruction } from '../stream/instructions'
import { splitForPrint } from '../text/charset'
import { type Mon, type NamedMon, nameMon } from '../text/names'

/** The event of one kind, also where one event type carries two kinds (`sideStart | sideEnd`). */
export type EventOf<K extends ScriptEvent['kind']> = ScriptEvent extends infer E
  ? E extends { readonly kind: infer Kinds }
    ? K extends Kinds
      ? E
      : never
    : never
  : never

/** Whether `a` and `b` name the same team member. */
export const sameMon = (a: PokemonRef | undefined, b: PokemonRef) =>
  a?.side === b.side && a.index === b.index

/** An instruction and the battle log line it came from. */
export interface Placed {
  readonly line: number
  readonly instruction: Instruction
}

/** Text for one PRINT, with what a phrase or a name reports beside it. */
export type PrintText = string | { readonly text: string; readonly fallback?: Noted }

/** The leads' text and SEND_OUT, by side, while the intro sends them out. */
export type Leads = Readonly<Record<Side, Placed[]>>

/** An ability pop-up that is up, as ABILITY's operands name it, and the line that raised it. */
export interface PopUp {
  readonly line: number
  readonly side: Side
  readonly ability: number
}

/** A player as the header and the text show them. */
export interface Player {
  /** For the trainer table: fitted to the charset, plain spaces. */
  readonly header: string
  /** For text: fitted, no-break spaces. */
  readonly text: string
}

export class Context {
  readonly instructions: Placed[] = []
  private sink: Placed[] = this.instructions
  readonly fallbacks: Fallback[] = []
  readonly players: Partial<Record<Side, Player>> = {}
  readonly teamSizes: Partial<Record<Side, number>> = {}
  /** The leads while the intro sends them out; INTRO's handler opens it. */
  leads: Leads | undefined
  /** The pop-up of an `-ability` line while it stays up over the events after it. */
  popUp: PopUp | undefined
  /** The Destiny Bond line whose holder takes its attacker down; the attacker's faint plays it. */
  takenDown: (EventOf<'effectActivate'> & { readonly who: PokemonRef }) | undefined
  /** The index in `script.events` of the event in hand; the walk sets it. */
  at = 0
  /** The Pokémon whose move the log shows last; its own HP loss is no hit. */
  mover: PokemonRef | undefined
  private readonly named: Readonly<Record<Side, readonly NamedMon[]>>
  private readonly active: Record<Side, number | undefined> = { near: undefined, far: undefined }

  readonly script: BattleScript

  constructor(script: BattleScript) {
    this.script = script
    const nameTeam = (side: Side) =>
      script.teams[side].map((member, index) => {
        const named = nameMon(side, member)
        this.note(this.firstLine({ side, index }), named.fallback)
        return named
      })
    this.named = { near: nameTeam('near'), far: nameTeam('far') }
  }

  emit(line: number, instruction: Instruction): void {
    this.sink.push({ line, instruction })
  }

  /** What `write` emits goes into `target` instead of the output. */
  capture(target: Placed[], write: () => void): void {
    this.sink = target
    try {
      write()
    } finally {
      this.sink = this.instructions
    }
  }

  /** One PRINT, or several where the text is too long for one. */
  print(line: number, text: PrintText): void {
    const { text: shown, fallback } = typeof text === 'string' ? { text } : text
    this.note(line, fallback)
    for (const part of splitForPrint(shown)) this.emit(line, { op: 'print', text: part })
  }

  note(line: number, fallback: Noted | undefined): void {
    if (fallback !== undefined) this.fallbacks.push({ line, ...fallback })
  }

  /** The team member as names and the party table show it. */
  member(ref: PokemonRef): NamedMon {
    const named = this.named[ref.side][ref.index]
    if (named === undefined)
      throw new Gen3Error(`no team member ${String(ref.index)} on the ${ref.side} side`)
    return named
  }

  mon(ref: PokemonRef): Mon {
    return this.member(ref).mon
  }

  player(side: Side): Player {
    const player = this.players[side]
    if (player === undefined) throw new Gen3Error(`the log names no player on the ${side} side`)
    return player
  }

  enter(ref: PokemonRef): void {
    this.active[ref.side] = ref.index
  }

  leave(side: Side): void {
    this.active[side] = undefined
  }

  /** The side of `ref`, which must be the active Pokémon there: every op names a side alone. */
  activeSide(ref: PokemonRef): Side {
    if (this.active[ref.side] !== ref.index) {
      throw new Gen3Error(`team member ${String(ref.index)} is not active on the ${ref.side} side`)
    }
    return ref.side
  }

  /** The event `offset` places from the one in hand: -1 the one before, 1 the one after. */
  near(offset: number): ScriptEvent | undefined {
    return this.script.events[this.at + offset]
  }

  /** Where an animation of the whole field plays: the near Pokémon, or the far one while none. */
  fieldSide(): Side {
    return this.active.near === undefined && this.active.far !== undefined ? 'far' : 'near'
  }

  /** The line that first sends the team member in, for what its name or form needs. */
  firstLine(ref: PokemonRef): number {
    const entry = this.script.events.find(
      (event) =>
        event.kind === 'switchIn' && event.who.side === ref.side && event.who.index === ref.index,
    )
    return entry?.line ?? 0
  }
}
