import { describe, expect, it } from 'vitest'

import { isLocalRequest, RequestLog, requestFault, storageCheck } from './gen5-requests'

const origin = 'http://gen5.localhost:5183'

describe('isLocalRequest', () => {
  it('counts the page origin, blob: and data: URLs as local', () => {
    expect(isLocalRequest(`${origin}/emulatorjs/data/loader.js`, origin)).toBe(true)
    expect(isLocalRequest(`blob:${origin}/1234`, origin)).toBe(true)
    expect(isLocalRequest('data:text/plain,x', origin)).toBe(true)
  })

  it('counts the CDN and a look-alike host as leaving the machine', () => {
    expect(isLocalRequest('https://cdn.emulatorjs.org/stable/data/version.json', origin)).toBe(
      false,
    )
    expect(isLocalRequest('http://gen5.localhost:51830/x', origin)).toBe(false)
  })
})

describe('requestFault', () => {
  const url = `${origin}/saves/route-20.sav`

  it('passes a GET or a HEAD without a body', () => {
    expect(requestFault({ method: 'GET', url, bodyBytes: undefined }, false)).toBeUndefined()
    expect(requestFault({ method: 'HEAD', url, bodyBytes: undefined }, true)).toBeUndefined()
  })

  it('fails any other method, with or without a body', () => {
    expect(requestFault({ method: 'POST', url, bodyBytes: 4 }, false)).toBe(
      `POST ${url}: not GET or HEAD`,
    )
    expect(requestFault({ method: 'PUT', url, bodyBytes: undefined }, false)).toBe(
      `PUT ${url}: not GET or HEAD`,
    )
  })

  it('fails a request that carries a body, even an empty one', () => {
    expect(requestFault({ method: 'GET', url, bodyBytes: 0 }, false)).toBe(
      `GET ${url}: carries a body of 0 bytes`,
    )
  })

  it("fails Vite's dev client on the built page alone", () => {
    const client = `${origin}/@vite/client`
    expect(
      requestFault({ method: 'GET', url: client, bodyBytes: undefined }, false),
    ).toBeUndefined()
    expect(requestFault({ method: 'GET', url: client, bodyBytes: undefined }, true)).toBe(
      `GET ${client}: the dev client on the built page`,
    )
  })
})

describe('RequestLog', () => {
  const get = { method: 'GET', url: `${origin}/`, bodyBytes: undefined }

  it('ends a clean run with one line that says so', () => {
    const requests = new RequestLog(false)
    requests.seen(get)
    requests.seen(get)
    requests.socket(`ws://gen5.localhost:5183/`)
    expect(requests.failed).toBe(false)
    expect(requests.summary()).toBe('requests: 2 seen, all local, none with a body')
  })

  it('adds the built page’s promise of no websocket and no dev client', () => {
    const requests = new RequestLog(true)
    requests.seen(get)
    expect(requests.summary()).toBe(
      'requests: 1 seen, all local, none with a body, no websocket, no dev client',
    )
  })

  it('fails the run on a request with a body and names it', () => {
    const requests = new RequestLog(false)
    requests.seen(get)
    expect(requests.seen({ method: 'POST', url: `${origin}/x`, bodyBytes: 10 })).toBe(
      `POST ${origin}/x: not GET or HEAD`,
    )
    expect(requests.failed).toBe(true)
    expect(requests.summary()).toBe(`requests: 2 seen, 1 fault: POST ${origin}/x: not GET or HEAD`)
  })

  it('fails the run on a request that left the machine, and on the built page a websocket', () => {
    const requests = new RequestLog(true)
    requests.refuse('https://cdn.emulatorjs.org/x', 'off the machine')
    requests.socket('ws://gen5.localhost:5184/')
    expect(requests.failed).toBe(true)
    expect(requests.summary()).toBe(
      'requests: 0 seen, 2 faults: https://cdn.emulatorjs.org/x: off the machine; ws://gen5.localhost:5184/: a websocket on the built page',
    )
  })
})

describe('storageCheck', () => {
  it('names the databases the origin holds at the end', () => {
    expect(storageCheck([])).toEqual({ line: 'indexedDB at the end: none', clean: true })
    expect(storageCheck(['EmulatorJS-states', 'EmulatorJS-core'])).toEqual({
      line: 'indexedDB at the end: EmulatorJS-states, EmulatorJS-core',
      clean: true,
    })
  })

  it('fails the run when one of them holds the save folder', () => {
    expect(storageCheck(['EmulatorJS-states', '/data/saves'])).toEqual({
      line: 'indexedDB at the end: EmulatorJS-states, /data/saves; FAULT: the save folder is in IndexedDB',
      clean: false,
    })
  })
})
