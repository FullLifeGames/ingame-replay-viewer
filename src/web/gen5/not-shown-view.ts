// The list beside the game on the Gen 5 page (#111): `#beside` with the end line, the heading,
// the counts and the rows of what Black 2 does not show (not-shown.ts). The rows come from other
// people's replays, so the view writes them as text, never as markup, and keeps each log line's
// first field in a span that stays on one line, as the Gen 3 page does (#90).
import type { RowParts } from '../status.ts'
import type { NotShownList } from './not-shown.ts'

function find(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector)
}

function rowItem({ head, kind, rest }: RowParts): HTMLLIElement {
  const item = document.createElement('li')
  const span = Object.assign(document.createElement('span'), {
    className: 'log-kind',
    textContent: kind,
  })
  item.append(head, ...(kind === '' ? [] : [span]), rest)
  return item
}

/** Shows `list` beside the game, with no end line yet. */
export function showNotShown(list: NotShownList): void {
  const heading = find('#not-shown')
  if (heading) heading.textContent = list.heading
  find('#not-shown-counts')?.replaceChildren(
    ...list.counts.map((text) =>
      Object.assign(document.createElement('li'), { textContent: text }),
    ),
  )
  find('#not-shown-rows')?.replaceChildren(...list.rows.map(rowItem))
  showEnd('')
  const beside = find('#beside')
  if (beside) beside.hidden = false
}

/** Writes the end line above the list; an empty line hides it. */
export function showEnd(line: string): void {
  const end = find('#replay-end')
  if (!end) return
  end.textContent = line
  end.hidden = line === ''
}
