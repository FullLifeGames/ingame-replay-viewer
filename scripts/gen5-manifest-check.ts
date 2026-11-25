// The checks on the manifest of the Gen 5 page's served files (#79, scripts/gen5-manifest.ts):
// every component names its licence and its source by commit, every file names a known
// component, no path stands twice, and each source's pin is well formed. They take a loose shape,
// so a spec can hand them a draft that lacks a field.
import { type Component, isOffered, type Source } from './gen5-manifest.ts'

export interface ManifestDraft {
  components: Readonly<Record<string, Partial<Component>>>
  files: readonly { path: string; components: readonly string[] }[]
}

const FULL_COMMIT = /^[0-9a-f]{40}$/

/** True when `part` names its source by a full commit, or gives the reason it offers none. */
function namesSource(part: Partial<Component>): boolean {
  const { source } = part
  if (source === undefined) return false
  return isOffered(source) ? FULL_COMMIT.test(source.commit) : source.none.trim() !== ''
}

/** The faults of one component, as the file `path` meets them. */
function componentFaults(path: string, id: string, part: Partial<Component> | undefined): string[] {
  if (part === undefined) return [`${path}: names the unknown component ${id}`]
  const faults: string[] = []
  if (part.licence === undefined) faults.push(`${path}: the component ${id} names no licence`)
  if (!namesSource(part)) faults.push(`${path}: the component ${id} names no source`)
  return faults
}

/** Throws with every fault of `manifest`, each naming its file or component. */
export function checkManifest(manifest: ManifestDraft): void {
  const faults: string[] = []
  const seen = new Set<string>()
  for (const { path, components } of manifest.files) {
    if (seen.has(path)) faults.push(`${path}: listed twice`)
    seen.add(path)
    if (components.length === 0) faults.push(`${path}: names no component`)
    for (const id of components) faults.push(...componentFaults(path, id, manifest.components[id]))
  }
  if (faults.length > 0) throw new Error(`gen5-manifest: ${faults.join('; ')}`)
}

/** The files with a component whose licence nobody can name. */
export function unnamedLicenceFiles(manifest: ManifestDraft): string[] {
  const unnamed = (id: string): boolean => typeof manifest.components[id]?.licence === 'object'
  return manifest.files.filter((file) => file.components.some(unnamed)).map((file) => file.path)
}

const PIN_RULES: readonly [keyof Source, RegExp, string][] = [
  ['name', /^[a-z0-9][a-z0-9.-]*$/, 'the name is not lower-case letters, digits, dots and dashes'],
  [
    'repository',
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?<!\.git)$/,
    'the repository is no https://github.com/<owner>/<repo>',
  ],
  ['commit', FULL_COMMIT, 'the commit is no full 40-hex id'],
  ['tar', /^[0-9a-f]{64}$/, "the tar's SHA-256 is no 64-hex digest"],
  ['basis', /\S/, 'the basis of its commit is empty'],
]

/** The faults of one source's pin (scripts/gen5-sources.ts), each naming the source. */
export function pinFaults(source: Source): string[] {
  return PIN_RULES.filter(([field, rule]) => !rule.test(source[field])).map(
    ([, , fault]) => `${source.name}: ${fault}`,
  )
}
