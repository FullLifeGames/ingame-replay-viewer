// The numbers of Black 2 (USA) that the Gen 5 spike (#72) reads from a pinned pokebw2 checkout.
// scripts/gen5-bw2.ts generates them into build/gen5/bw2.json at run time (D4); nothing of pokebw2
// is committed, and the pure modules here take the numbers as input and hold none of the game's.

/** One symbol of the ds-decomp config: a function, data, bss or a label, at its retail address. */
export interface Bw2Symbol {
  name: string
  kind: 'function' | 'data' | 'bss' | 'label'
  address: number
  /** A function's size in bytes; data and bss lines carry none. */
  size?: number
  /** A function's or a label's instruction set, from its line; data and bss lines carry none. */
  mode?: 'thumb' | 'arm'
  /** The module whose symbols list names it: `arm9` or an overlay such as `ov167`. */
  module: string
}

/** One bitfield or whole field of a struct, at its byte offset. */
export interface FieldLayout {
  offset: number
  /** The field's bytes; for a bitfield the bytes of its container. */
  size: number
  /** For a bitfield: its lowest bit inside the container, and its width in bits. */
  bit?: number
  bits?: number
}

/** A struct as the ARM9's compiler lays it out; nested fields carry dotted paths (`sendCmd.size`). */
export interface StructLayout {
  size: number
  align: number
  fields: Record<string, FieldLayout>
  /** For a struct laid out only up to this member: then `size` ends with that member. */
  upTo?: string
}

/** Bits of one argument inside one put: `(args[arg] & mask) << shift`. */
export interface ArgField {
  arg: number
  mask: number
  shift: number
}

/** One write of the queue: `bytes` bytes, high byte first, of the fields ORed together. */
export interface ArgPut {
  bytes: number
  fields: ArgField[]
}

/** An argument format (`SC_ARGS_*`): its code, its argument count and the puts that write it. */
export interface ArgFormat {
  code: number
  argCount: number
  puts: ArgPut[]
}

/** How the queue writes a message command (BtlServerCmdQueue_PutMsg). */
export interface MessageRules {
  /** The formats whose commands the client reads as messages (BtlServerCmdQueue_Read). */
  formats: string[]
  /** The one command that carries a sound effect before its arguments. */
  soundCommand: string
  /** The word that ends a message command's arguments (SC_MSG_ARG_END). */
  argEnd: number
}

/** What the packer needs: the commands, the formats and the message rules. */
export interface ServerCmdTable {
  serverCommands: Record<string, number>
  argFormats: Record<string, ArgFormat>
  /** Each command's format name, from the table `sCmdFormats`. */
  commandFormats: Record<string, string>
  messages: MessageRules
}

/** A number of the player's side and one of the opponent's. */
export interface Sides {
  player: number
  opponent: number
}

/** A single battle's clients and the client at each battle position, as its setup assigns them
 * (BtlMain_SetupAloneSingle). */
export interface SingleBattle {
  clientCount: number
  /** The client ID at each position, by position. */
  posClientIds: number[]
  /** The player's client and the opponent's: the setup creates the opponent's as the AI. */
  clients: Sides
}

/** The battle's structs that lead from the server to the Pokémon, some laid out only up to the
 * member the spike reads (`upTo`), and the server's step while it waits for the actions. */
export interface BattleNumbers {
  /** BtlServer, up to its poke container. */
  server: StructLayout
  /** BtlMainModule, up to its clients. */
  mainModule: StructLayout
  /** BtlPokeCon, whole: the main module holds two in a row, the clients' first. */
  pokeCon: StructLayout
  /** BattleParty, whole. */
  party: StructLayout
  /** BattleMonCore up to the mon ID; it is BattleMon's first member, so its offsets are hers. */
  monCore: StructLayout
  /** BTL_SERVER_ACTION_SEQ_WAIT_SELECT. */
  waitSelectSeq: number
  /** The single battle's setup. */
  single: SingleBattle
}

/** A trigger of the map's events: the player steps on row `z` from column `x` on, across `width`
 * columns. */
export interface TriggerPlace {
  x: number
  z: number
  width: number
}

/** The tile an NPC of the map's events stands on. */
export interface ActorPlace {
  x: number
  z: number
}

/** The places on the route of src/gen5/route.ts, each from the event whose script shows its key's
 * line first (scripts/gen5-bw2-field.ts). `z` is the row that the player's position reads. */
export interface RoutePlaces {
  /** Hugh comes back to the player once he has his starter. */
  hughTrigger: TriggerPlace
  /** The first battle with Hugh starts. */
  battleTrigger: TriggerPlace
  /** Hugh sends the player up to the outlook. */
  outlookTrigger: TriggerPlace
  /** Bianca, who hands out the starters at the outlook. */
  bianca: ActorPlace
}

/** The addresses from `start` up to and without `end`. */
export interface Span {
  start: number
  end: number
}

/** A function the direct entry's routine calls through a register. */
export interface EntryFunction {
  /** The address to call: the symbol's, with bit 0 set for a Thumb function. */
  call: number
  thumb: boolean
}

/** What the direct battle start (#97) needs, all by pokebw2's own names (scripts/gen5-bw2-entry.ts). */
export interface EntryNumbers {
  /** The functions the routine calls, in the order of ENTRY_FUNCTIONS. */
  functions: Record<string, EntryFunction>
  /** The data the page compares and hands over: the proc manager, the boot proc's tables and
   * param, the battle proc's table. */
  data: Record<string, Bw2Symbol>
  /** The heap, the overlays, the music's channels, the trainer class, the fast text speed, the
   * string terminator, the single and the double battle style, and the trainer track. */
  constants: Record<string, number>
  /** The structs the page and the routine write through, by struct name. */
  layouts: Record<string, StructLayout>
  /** The size of the string buffer each named function creates (GFL_StrBufCreate's first
   * argument), in characters with the terminator: the room the page may write a name into. */
  bufferSizes: Record<string, number>
  /** Each side's element of the setup's per-client arrays (party, playerInfo, trainers), as the
   * trainer battle's setup fills them. */
  setupIndices: Sides
  /** The battle overlay's span in RAM, where the routine lives until the battle loads there. */
  battleOverlay: Span
  /** The spans of the overlays GameInit loads at boot, by overlay name; the battle overlay's
   * span meets none of them. */
  bootOverlays: Record<string, Span>
}

/** The selector in the function that picks a block's place: the PID's row of the block table is
 * `(pid & mask) >>> shift`. */
export interface BlockSelector {
  mask: number
  shift: number
}

/** One step of the cipher's key: `key = key * multiplier + increment` in 32 bits, and the
 * halfword that XORs the data is `key >>> shift`. */
export interface CipherStep {
  multiplier: number
  increment: number
  shift: number
}

/** A Pokémon's data as the game stores it (#97), all by pokebw2's own names
 * (scripts/gen5-bw2-pkm.ts). */
export interface PkmNumbers {
  /** PartyPkm, PokeParty, PkmBufferChunk and the four blocks PkmBlockA to PkmBlockD. */
  layouts: Record<string, StructLayout>
  /** Each block's column in the block table, by block struct name. */
  blockColumns: Record<string, number>
  /** The block table: one row per selector value, each block's byte offset in the content
   * buffer by its column. */
  blockOffsets: number[][]
  selector: BlockSelector
  cipher: CipherStep
  /** A PID is shiny when the XOR of the halves of OT id and PID lies below this bound. */
  shinyBelow: number
  /** The party's size, the genders, the language and the version a Pokémon carries. */
  constants: Record<string, number>
  species: Record<string, number>
  moves: Record<string, number>
  items: Record<string, number>
  abilities: Record<string, number>
  natures: Record<string, number>
}

/** The whole of build/gen5/bw2.json. */
export interface Bw2Numbers extends ServerCmdTable {
  pokebw2: { repository: string; commit: string }
  symbols: Record<string, Bw2Symbol>
  adapterCommands: Record<string, number>
  adapterStates: Record<string, number>
  queueSize: number
  adapter: StructLayout
  battle: BattleNumbers
  route: RoutePlaces
  /** The trainer the shipped save stands before (#78), Youngster Terrell on Route 20: the tile of
   * his NPC entry, found by his trainer constant (scripts/gen5-bw2-trainer.ts). He looks up along
   * his column `x`. */
  saveTrainer: ActorPlace
  entry: EntryNumbers
  pkm: PkmNumbers
}
