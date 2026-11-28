// What every Gen 5 browser run shares (#111): the page's host name, Chromium's flags, the two
// viewports and the server of the dev or the built page. It imports no shot scene, so each scene
// and each script that opens the page reads these from here without an import cycle.
import type { AddressInfo } from 'node:net'

import { BUILT_PORT, buildGen5Page, startBuiltServer } from './gen5-built.ts'
import { log } from './gen5-page.ts'
import { startGen5Server } from './gen5-serve.ts'

/** A *.localhost name is a secure context and resolves to loopback, but it is not the name
 * "localhost" or "127.0.0.1", on which EmulatorJS asks its CDN for a newer version. */
export const PAGE_HOST = 'gen5.localhost'

// Headless Chromium has no GPU; EmulatorJS draws with WebGL through SwiftShader.
// The page's host name maps to the server's loopback address only.
export const CHROMIUM_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  `--host-resolver-rules=MAP ${PAGE_HOST} 127.0.0.1`,
]

/** A phone's width in CSS pixels, for the page screenshot before the pick. */
export const PHONE_VIEWPORT = { width: 360, height: 800 }
export const RUN_VIEWPORT = { width: 640, height: 960 }

export interface Served {
  port: number
  close: () => Promise<void>
}

/** Vite's dev server of the page, or the built page after a build (--built). */
export async function serve(built: boolean): Promise<Served> {
  if (built) {
    await buildGen5Page()
    const server = await startBuiltServer({ host: false, port: BUILT_PORT })
    log(`serving the built page on port ${String(BUILT_PORT)}`)
    const close = () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
        server.closeAllConnections()
      })
    return { port: (server.address() as AddressInfo).port, close }
  }
  const server = await startGen5Server()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('gen5-shot: the server has no port')
  return { port: address.port, close: () => server.close() }
}
