/** A battle script the Gen 3 game backend cannot turn into an instruction stream, or stream bytes it cannot read. */
export class Gen3Error extends Error {
  override name = 'Gen3Error'
}
