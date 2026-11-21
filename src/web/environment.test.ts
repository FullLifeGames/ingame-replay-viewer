import { describe, expect, it } from 'vitest'

import { environmentProblem } from './environment'

describe('environmentProblem', () => {
  // Opened as http://100.x.y.z:5177 over Tailscale: not a secure context, so no SharedArrayBuffer.
  // The user reads this line on their own phone or PC, where localhost is not devbox.
  it('names devbox, its localhost address and the tailnet HTTPS route on an insecure page', () => {
    const line = environmentProblem({ isSecureContext: false, crossOriginIsolated: false })
    expect(line).toContain('secure context')
    expect(line).toContain('on devbox at http://localhost:5177')
    expect(line).toContain('tailscale serve')
    expect(line).toContain('src/web/README.md')
  })

  it('names the COOP and COEP headers on a secure page that is not cross-origin isolated', () => {
    const line = environmentProblem({ isSecureContext: true, crossOriginIsolated: false })
    expect(line).toContain('cross-origin isolated')
    expect(line).toContain('Cross-Origin-Opener-Policy: same-origin')
    expect(line).toContain('Cross-Origin-Embedder-Policy: require-corp')
  })

  it('has no line for a secure, cross-origin isolated page', () => {
    expect(environmentProblem({ isSecureContext: true, crossOriginIsolated: true })).toBeUndefined()
  })
})
