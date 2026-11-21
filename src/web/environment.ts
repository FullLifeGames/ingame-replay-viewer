// What the page needs from the browser before the emulator can run: mGBA's threads need
// SharedArrayBuffer, which a browser grants only to a secure, cross-origin isolated page. The
// SHA1 check (crypto.subtle) needs the secure context as well.

/** The two flags of the page's global scope that decide it. */
export interface PageEnvironment {
  readonly isSecureContext: boolean
  readonly crossOriginIsolated: boolean
}

/** The line the page shows instead of its controls, or undefined when the emulator can run. */
export function environmentProblem(environment: PageEnvironment): string | undefined {
  if (!environment.isSecureContext) {
    return (
      'This page is not a secure context, so the emulator cannot run. Open it on devbox at ' +
      'http://localhost:5177, or over the HTTPS address that tailscale serve gives it ' +
      '(see src/web/README.md).'
    )
  }
  if (!environment.crossOriginIsolated) {
    return (
      'This page is not cross-origin isolated, so the emulator cannot run: serve it with ' +
      'Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, ' +
      'as npm run dev does.'
    )
  }
  return undefined
}
