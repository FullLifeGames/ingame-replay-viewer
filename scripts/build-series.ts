// Whether build/rom/ holds the build the page's e2e needs: the whole patch series and the file
// that boots into the replay. A build without them still patches and animates (vanilla Emerald's
// intro), so the e2e's frames alone would pass for it.

const INFO = 'build/rom/build-info.json'
const BOOT_FILE = 'src/replay_boot.c'
const REBUILD = 'run npm run rom:build'

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const nameOf = (entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null ? (entry as { name?: unknown }).name : undefined

const shownList = (names: readonly unknown[]): string =>
  names.length === 0 ? '(none)' : names.map(String).join(', ')

/** What `build-info.json` (`info`) lacks against `series`, as lines; empty for a whole build. */
export function builtSeriesProblems(info: unknown, series: readonly string[]): string[] {
  const fields = typeof info === 'object' && info !== null ? (info as Record<string, unknown>) : {}
  const built = listOf(fields.series).map(nameOf)
  const problems: string[] = []
  if (built.length !== series.length || built.some((name, index) => name !== series[index])) {
    problems.push(
      `${INFO} lists the series ${shownList(built)}, rom/gen3/patches/series names ` +
        `${shownList(series)}: ${REBUILD}`,
    )
  }
  if (!listOf(fields.copied).includes(BOOT_FILE)) {
    problems.push(`${INFO} does not list ${BOOT_FILE} among the copied files: ${REBUILD}`)
  }
  return problems
}
