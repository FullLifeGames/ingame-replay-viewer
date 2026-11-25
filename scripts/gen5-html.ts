// The HTML pieces the Gen 5 licences page (#79) builds from: one escape rule for every string
// that comes from a fetched file, a link and a block of quoted text. scripts/gen5-licences.ts and
// scripts/gen5-notice-groups.ts import them.

/** `text` with the five characters HTML gives a meaning escaped. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export const link = (href: string, text: string) =>
  `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`

export const pre = (text: string) => `<pre>${escapeHtml(text)}</pre>`

export const short = (commit: string) => commit.slice(0, 7)
