// Where the Gen 5 spike (#72) keeps what it fetches and what it makes. Both folders sit under the
// repository's gitignored /.cache/ and /build/ (ADR 0002): nothing of them is committed. The page's
// own folders sit in src/web/gen5/.
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

export const GEN5_PATHS = {
  repo: REPO,
  /** The fetched EmulatorJS packages: tarballs, a staging folder, and the served site. */
  emulatorjs: `${REPO}/.cache/gen5/emulatorjs`,
  site: `${REPO}/.cache/gen5/emulatorjs/site`,
  page: `${REPO}/src/web/gen5`,
  /** The saves we made from New Game that the servers answer under /saves/ (#78, ADR 0002). */
  saves: `${REPO}/src/web/gen5/saves`,
  /** The page as Vite builds it, for the user's own check (scripts/gen5-built.ts). */
  built: `${REPO}/build/gen5/page`,
  frames: `${REPO}/build/gen5/frames`,
  /** States saved at the route's marks (src/gen5/route.ts), never committed or served. */
  states: `${REPO}/build/gen5/states`,
  runs: `${REPO}/build/gen5/runs`,
  /** The pinned pokebw2 checkout (GPL-3.0; read at run time, never committed). */
  pokebw2: `${REPO}/.cache/gen5/pokebw2`,
  /** The numbers scripts/gen5-bw2.ts generates from it. */
  bw2Json: `${REPO}/build/gen5/bw2.json`,
}
