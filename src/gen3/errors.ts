/** A battle script the Gen 3 game backend cannot turn into an instruction stream, or stream bytes it cannot read. */
export class Gen3Error extends Error {
  override name = 'Gen3Error'
}

/** A battle of a generation the stream does not play; carries the battle's generation. */
export class GenerationRefusal extends Gen3Error {
  override name = 'GenerationRefusal'
  /** The battle's generation, from its `|gen|` line. */
  readonly gen: number

  /** `played` names the generations the stream plays in words, as the backend writes them. */
  constructor(gen: number, played: string) {
    super(`the stream plays ${played} battles, this one is Gen ${String(gen)}`)
    this.gen = gen
  }
}
