// A phrase template (plan §5, D2): our own wording of one scene, tagged with the symbol of the
// pinned `src/battle_message.c` whose string it mirrors. The devbox spec
// `scripts/gen3-phrases.test.ts` renders that string and holds the two equal; nothing of the file
// lives in this repository.

/** `STRINGID_*` through `gBattleStringsTable`, or a `sText_*`/`gText_*` string of the file. */
export type MessageId = `STRINGID_${string}` | `sText_${string}` | `gText_${string}`

export interface Template<A extends readonly unknown[]> {
  readonly id: MessageId
  readonly render: (...args: A) => string
}

/** Any template, as the devbox spec walks them. */
export type AnyTemplate = Template<never>

export function tagged<A extends readonly unknown[]>(
  id: MessageId,
  render: (...args: A) => string,
): Template<A> {
  return { id, render }
}

/** A scene the game has no message for: our wording stands in, and the backend lists it. */
interface PhraseFallback {
  readonly kind: 'phrase'
  readonly detail: string
}

/** The text of a scene that an effect picks; `fallback` is set where no game message fits. */
export interface Phrase {
  readonly text: string
  readonly fallback?: PhraseFallback
}

/** Our wording for `scene`, listed as a fallback. */
export function ownPhrase(text: string, scene: string): Phrase {
  return { text, fallback: { kind: 'phrase', detail: `no game message for ${scene}` } }
}
