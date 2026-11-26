// The replay label (#69, #90): how the pages name a replay, in the example select and in every
// status line. DOM-free and without Vite's glob, so a Node spec and the e2e import it too.

/** A replay's own `format` and `players`, as its JSON or its battle log names them. */
export interface LabelFields {
  readonly format: string
  readonly players: readonly string[]
}

/**
 * A replay's label: its format without the brackets around its first part ("[Gen 3] OU" reads
 * "Gen 3 OU"; a format with no such part stays as written), its players in the order of
 * `players`, and the number its id ends in (the whole id when it ends in none). An empty format or
 * an empty list of players drops its part; with neither, the label is the id itself. The names
 * come from other people's replays, so a page writes the label as text, never as markup.
 */
export function replayLabel(id: string, { format, players }: LabelFields): string {
  const shown = format.replace(/^\[([^\]]*)\]\s*/, '$1 ').trim()
  const head = [shown, players.join(' vs ')].filter((part) => part !== '').join(': ')
  const number = /-(\d+)$/.exec(id)?.[1] ?? id
  return head === '' ? id : `${head} (${number})`
}
