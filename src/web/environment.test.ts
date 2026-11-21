import { describe, expect, it } from 'vitest'

import { environmentProblem } from './environment'

describe('environmentProblem', () => {
  // Opened as http://100.x.y.z:5177 over Tailscale: not a secure context, so no SharedArrayBuffer.
  it('names localhost and HTTPS on a page that is not a secure context', () => {
    const line = environmentProblem({ isSecureContext: false, crossOriginIsolated: false })
    expect(line).toContain('secure context')
    expect(line).toContain('http://localhost')
    expect(line).toContain('HTTPS')
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
