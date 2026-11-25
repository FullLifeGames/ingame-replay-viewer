// The command line of scripts/gen5-route.ts (#72, #78): which route a run plays, the state it
// starts from, the save it queues or takes, and the page's address. Usage: --route
// new-game|save-here|continue|trainer, --from <mark> and --to <mark> (the new
// game's marks; --from starts from the state s5-<mark>), --state <file base> (any state under
// build/gen5/states/), --save <file> (queued through the hook before the pick), --take-save
// <name> (written to build/gen5/saves/<name>.sav once it stands still), --query <text>,
// --label, --uncapped, --minutes.
import { parseArgs } from 'node:util'

import { isSaveName, SAVE_NAME_RULE } from '../src/gen5/save-file.ts'

const ROUTES = ['new-game', 'save-here', 'continue', 'trainer'] as const

export type RouteName = (typeof ROUTES)[number]

export interface RouteOptions {
  route: RouteName
  from: string | undefined
  to: string | undefined
  /** A state's file base under build/gen5/states/, for a run from anywhere. */
  state: string | undefined
  /** A save file of the build machine that the page loads when the game starts. */
  save: string | undefined
  /** The name to write the game's save under once the run is done. */
  takeSave: string | undefined
  /** The page address's query, '' or starting with '?'. */
  query: string
  label: string
  uncapped: boolean
  deadlineMs: number
}

const isRoute = (name: string): name is RouteName => (ROUTES as readonly string[]).includes(name)

/** The routes that start from a state alone, each with the sentence that says why. */
const STATE_ROUTES: Partial<Record<RouteName, string>> = {
  'save-here': 'The save route needs --state: it saves where a state stands.',
  trainer:
    'The trainer route needs --state: it plays on from a state of the rival battle or later.',
}

/** Where the route and the state disagree, or undefined. */
function routeProblem(options: RouteOptions): string | undefined {
  const needsState = STATE_ROUTES[options.route]
  if (needsState !== undefined && options.state === undefined) return needsState
  if (options.route !== 'new-game' && (options.from ?? options.to) !== undefined)
    return '--from and --to cut the new-game route only.'
  if (options.from !== undefined && options.state !== undefined)
    return '--from names a state already; give --from or --state, not both.'
  return undefined
}

/** The command line's sense, or an error that says which option is wrong. */
function check(options: RouteOptions, minutes: number, minutesText: string): void {
  const problem = routeProblem(options)
  if (problem !== undefined) throw new Error(problem)
  if (options.takeSave !== undefined && !isSaveName(options.takeSave))
    throw new Error(`--take-save takes ${SAVE_NAME_RULE}, not "${options.takeSave}".`)
  if (!(minutes > 0)) throw new Error(`--minutes takes a positive number, not "${minutesText}".`)
}

export function readRouteOptions(args: string[], now: number): RouteOptions {
  const { values } = parseArgs({
    args,
    options: {
      route: { type: 'string', default: 'new-game' },
      from: { type: 'string' },
      to: { type: 'string' },
      state: { type: 'string' },
      save: { type: 'string' },
      'take-save': { type: 'string' },
      query: { type: 'string', default: '' },
      label: { type: 'string', default: 's5' },
      uncapped: { type: 'boolean', default: false },
      minutes: { type: 'string', default: '18' },
    },
  })
  if (!isRoute(values.route))
    throw new Error(
      `--route takes new-game, save-here, continue or trainer, not "${values.route}".`,
    )
  const minutes = Number(values.minutes)
  const query = values.query.replace(/^\?/, '')
  const options: RouteOptions = {
    route: values.route,
    from: values.from,
    to: values.to,
    state: values.state,
    save: values.save,
    takeSave: values['take-save'],
    query: query === '' ? '' : `?${query}`,
    label: values.label,
    uncapped: values.uncapped,
    deadlineMs: now + minutes * 60_000,
  }
  check(options, minutes, values.minutes)
  return options
}

/** The file base of the state a run starts from: the new game's s5-<mark>, or --state. */
export function stateBase(options: RouteOptions): string | undefined {
  return options.from === undefined ? options.state : `s5-${options.from}`
}
