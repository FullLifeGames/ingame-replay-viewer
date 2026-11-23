/** A battle script the Gen 3 game backend cannot turn into an instruction stream, or stream bytes it cannot read. */
export class Gen3Error extends Error {
  override name = 'Gen3Error'
}

/** A battle newer than the generation the stream plays; carries the battle's generation. */
export class GenerationRefusal extends Gen3Error {
  override name = 'GenerationRefusal'
  /** The battle's generation, from its `|gen|` line. */
  readonly gen: number

  constructor(gen: number, newest: number) {
    super(`the stream plays Gen ${String(newest)} battles, this one is Gen ${String(gen)}`)
    this.gen = gen
  }
}
