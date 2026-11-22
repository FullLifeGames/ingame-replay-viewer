// What the page needs from the browser before the emulator can run: mGBA's threads need
// SharedArrayBuffer, which a browser grants only to a secure, cross-origin isolated page. The
// SHA1 check (crypto.subtle) needs the secure context as well. The WebAssembly spike page needs
// the same for its worker and names the game instead. It runs the game in a module worker, which
// an older browser cannot start: the page would load, and Start would show nothing (#49). A
// missing audio worklet is no such case: the game plays without sound and says why (run.ts).

/** The flags of the page's global scope that decide it. */
export interface PageEnvironment {
  readonly isSecureContext: boolean
  readonly crossOriginIsolated: boolean
  /** Whether the browser starts module workers (startsModuleWorkers); the emulator page leaves it out. */
  readonly moduleWorkers?: boolean
}

/**
 * The line the page shows instead of its controls, or undefined when `runner` can run: the
 * emulator on the emulator page, the game on the spike page.
 */
export function environmentProblem(
  environment: PageEnvironment,
  runner = 'the emulator',
): string | undefined {
  if (!environment.isSecureContext) {
    return (
      `This page is not a secure context, so ${runner} cannot run. Open it on devbox at ` +
      'http://localhost:5177, or over the HTTPS address that tailscale serve gives it ' +
      '(see src/web/README.md).'
    )
  }
  if (!environment.crossOriginIsolated) {
    return (
      `This page is not cross-origin isolated, so ${runner} cannot run: serve it with ` +
      'Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, ' +
      'as npm run dev does.'
    )
  }
  if (environment.moduleWorkers === false) {
    return (
      `This browser cannot start a module worker, so ${runner} cannot run. Firefox 114, ` +
      'Chrome 80, Safari 15 and their later versions can.'
    )
  }
  return undefined
}

/** How the check starts a worker: `new Worker(url, options)` with a probe script. */
export type StartWorker = (options: WorkerOptions) => { terminate(): void }

/**
 * Whether the browser starts module workers: undefined when it has no `Worker`. Only a browser
 * that knows module workers reads the `type` option, and it reads the options before it loads the
 * script, so the probe ends at once and a probe that throws has still answered.
 */
export function startsModuleWorkers(start: StartWorker | undefined): boolean {
  if (start === undefined) return false
  let asked = false
  const options: WorkerOptions = {
    get type(): WorkerType {
      asked = true
      return 'module'
    },
  }
  try {
    start(options).terminate()
  } catch {
    // The answer is in `asked`: a browser that refuses the probe script read the options first.
  }
  return asked
}
