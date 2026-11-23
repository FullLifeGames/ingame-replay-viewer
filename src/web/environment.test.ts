import { describe, expect, it } from 'vitest'

import { environmentProblem, startsModuleWorkers } from './environment'

describe('environmentProblem', () => {
  // Opened as http://100.x.y.z:5177 over Tailscale: not a secure context, so no SharedArrayBuffer.
  // The user reads this line on their own phone or PC, where localhost is not devbox.
  it('names devbox, its localhost address and the tailnet HTTPS route on an insecure page', () => {
    const problem = environmentProblem({ isSecureContext: false, crossOriginIsolated: false })
    expect(problem?.kind).toBe('insecure')
    const line = problem?.detail
    expect(line).toContain('secure context')
    expect(line).toContain('on devbox at http://localhost:5177')
    expect(line).toContain('tailscale serve')
    expect(line).toContain('src/web/README.md')
  })

  it('names the COOP and COEP headers on a secure page that is not cross-origin isolated', () => {
    const problem = environmentProblem({ isSecureContext: true, crossOriginIsolated: false })
    expect(problem?.kind).toBe('isolation')
    const line = problem?.detail
    expect(line).toContain('cross-origin isolated')
    expect(line).toContain('Cross-Origin-Opener-Policy: same-origin')
    expect(line).toContain('Cross-Origin-Embedder-Policy: require-corp')
  })

  // The WebAssembly spike page runs no emulator; its lines name the game instead.
  it('names what the page runs', () => {
    for (const isSecureContext of [false, true]) {
      const environment = { isSecureContext, crossOriginIsolated: false }
      const line = environmentProblem(environment, 'the game')?.detail
      expect(line).toContain('so the game cannot run')
      expect(line).not.toContain('emulator')
    }
  })

  it('has no line for a secure, cross-origin isolated page', () => {
    expect(environmentProblem({ isSecureContext: true, crossOriginIsolated: true })).toBeUndefined()
  })

  // The WebAssembly page runs the game in a module worker; a browser without one would show the
  // page and then nothing after Start (#49).
  it('names the module worker and the browsers that start one when the browser cannot', () => {
    const environment = { isSecureContext: true, crossOriginIsolated: true, moduleWorkers: false }
    expect(environmentProblem(environment, 'the game')).toEqual({
      kind: 'workers',
      detail:
        'This browser cannot start a module worker, so the game cannot run. Firefox 114, ' +
        'Chrome 80, Safari 15 and their later versions can.',
    })
  })

  it('names the secure context and the isolation before the module worker', () => {
    const insecure = { isSecureContext: false, crossOriginIsolated: false, moduleWorkers: false }
    expect(environmentProblem(insecure, 'the game')?.kind).toBe('insecure')
    const open = { isSecureContext: true, crossOriginIsolated: false, moduleWorkers: false }
    expect(environmentProblem(open, 'the game')?.kind).toBe('isolation')
  })

  it('has no line when the browser starts module workers', () => {
    const environment = { isSecureContext: true, crossOriginIsolated: true, moduleWorkers: true }
    expect(environmentProblem(environment, 'the game')).toBeUndefined()
  })
})

describe('startsModuleWorkers', () => {
  // A browser with module workers reads the type option; an older one never looks at it.
  const reading = (options: WorkerOptions) => {
    expect(options.type).toBe('module')
    return { terminate: () => undefined }
  }
  const ignoring = () => ({ terminate: () => undefined })

  it('says yes when the Worker constructor reads the type option', () => {
    expect(startsModuleWorkers(reading)).toBe(true)
  })

  it('says no when the Worker constructor ignores the type option', () => {
    expect(startsModuleWorkers(ignoring)).toBe(false)
  })

  it('says no when the browser has no Worker', () => {
    expect(startsModuleWorkers(undefined)).toBe(false)
  })

  it('ends the probe worker', () => {
    let ended = 0
    startsModuleWorkers((options) => {
      expect(options.type).toBe('module')
      return { terminate: () => (ended += 1) }
    })
    expect(ended).toBe(1)
  })

  // The browser reads the options before it loads the script, so a probe that throws has answered.
  it('keeps the answer of a probe that throws after reading the type option', () => {
    const throwing = (options: WorkerOptions) => {
      expect(options.type).toBe('module')
      throw new DOMException('the probe script is refused', 'SecurityError')
    }
    expect(startsModuleWorkers(throwing)).toBe(true)
  })
})
