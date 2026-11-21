/** A battle script the Gen 3 game backend cannot turn into an instruction stream. */
export class Gen3Error extends Error {
  override name = 'Gen3Error'
}
