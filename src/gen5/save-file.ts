// Where the game's battery save lives in EmulatorJS's melonDS core, and which save the page's
// address asks for (#78). The path has four sources in EmulatorJS 4.2.3: RetroArch's save folder
// is `savefile_directory = "/data/saves"` (GameManager.js, getRetroArchCfg); RetroArch puts the
// core's saves into a folder of the core's name inside it; the core's package says `"save":"sav"`
// in its core.json, which emulator.js hands over as `getSavExt`; and the content is named after
// EJS_gameName, since the page hands the dump over as a blob: URL. The save file is the content's
// base name with the save extension. The core reported this path in a run on the build machine
// (`save_file_path`, GameManager.js's getSaveFilePath). The page fetches a named save from
// `/saves/<name>.sav` (scripts/gen5-files.ts serves that folder alone).

/** The content's name in the core's file system: the page sets it as EJS_gameName. */
export const CONTENT_NAME = 'black2.nds'

/** RetroArch's save folder in EmulatorJS. */
export const SAVE_FOLDER = '/data/saves'

/** The core's own folder in the save folder: the core's name. */
export const CORE_SAVE_FOLDER = `${SAVE_FOLDER}/melonDS`

/** The save extension of the melonDS core's core.json. */
const SAVE_EXTENSION = 'sav'

/** Where the core reads and writes the save of `content`. */
export function savePath(content: string, extension: string): string {
  const base = content.replace(/\.[^./]*$/, '')
  return `${CORE_SAVE_FOLDER}/${base}.${extension}`
}

export const SAVE_PATH = savePath(CONTENT_NAME, SAVE_EXTENSION)

/** Where both servers answer the saves we made; only names that pass `isSaveName`. */
export const SAVES_PREFIX = '/saves/'

/** What `isSaveName` takes, in the words of the scripts' refusals. */
export const SAVE_NAME_RULE = 'lower-case letters and digits, with single hyphens between them'

/** Lower-case letters and digits, with single hyphens between them: no dot, no slash, no hyphen
 * at an end or two in a row, nothing that climbs. */
export function isSaveName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
}

export const saveUrl = (name: string) => `${SAVES_PREFIX}${name}.${SAVE_EXTENSION}`

const fileName = (name: string) => `${name}.${SAVE_EXTENSION}`

/** The save the address names with `?save=<name>`, or undefined for none or a bad name. */
export function saveName(query: string): string | undefined {
  const name = new URLSearchParams(query).get('save')
  return name !== null && isSaveName(name) ? name : undefined
}

const NO_START = 'so the page does not start the game.'

/** The sentence for an address whose `save` is no save name; undefined when it names none or a
 * good one. */
export function saveQueryProblem(query: string): string | undefined {
  const name = new URLSearchParams(query).get('save')
  if (name === null || isSaveName(name)) return undefined
  return `The address asks for the save "${name}", which is no save name, ${NO_START}`
}

/** The sentence for a fetch of a save that failed before any answer. */
export const saveUnreachable = (name: string) =>
  `The page could not reach the server for the save file ${fileName(name)}, so it does not start the game.`

/** The sentence for the server's answer to a save, or undefined when its bytes can load. Status 0
 * is what a fetch without an answer gives. */
export function saveProblem(name: string, status: number, bytes: number): string | undefined {
  const file = fileName(name)
  if (status === 0) return saveUnreachable(name)
  if (status === 404) return `The save file ${file} is missing on the server, ${NO_START}`
  if (status < 200 || status > 299) {
    return `The server answered ${String(status)} for the save file ${file}, ${NO_START}`
  }
  if (bytes === 0) return `The save file ${file} on the server is empty, ${NO_START}`
  return undefined
}
