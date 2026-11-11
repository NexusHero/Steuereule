// Address search over real HTTP (guard + ValidationPipe + controller), ADR-0064. The street data
// comes from a temp file named by STREET_DATA_PATH — the same seam production uses.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'http-test-secret'

const CSV = ['Name,PostalCode,Locality,RegionalKey,Borough,Suburb', 'Hauptstr.,50667,Köln,05315000,,', 'Domkloster,50667,Köln,05315000,,'].join('\n')

describe('POST /v1/adressen/suche', () => {
  let app: NestFastifyApplication
  let dir: string
  const original = process.env.STREET_DATA_PATH

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'street-data-test-'))
  })

  afterEach(async () => {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    if (original === undefined) delete process.env.STREET_DATA_PATH
    else process.env.STREET_DATA_PATH = original
  })

  async function start(withData: boolean) {
    if (withData) {
      const path = join(dir, 'streets.csv')
      writeFileSync(path, CSV)
      process.env.STREET_DATA_PATH = path
    } else delete process.env.STREET_DATA_PATH
    app = (await buildTestApp()).app
  }

  const search = (payload: unknown) => app.inject({ method: 'POST', url: '/v1/adressen/suche', payload: payload as object })

  it('answers streets with postal code, place and Bundesland, and hands back the house number', async () => {
    await start(true)
    const response = await search({ query: 'Hauptstr. 12, Köln' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      available: true,
      houseNumber: '12',
      hits: [{ street: 'Hauptstraße', postalCode: '50667', city: 'Köln', state: 'NW' }],
    })
  })

  it('says "not available" instead of failing when no street data is installed', async () => {
    await start(false)
    const response = await search({ query: 'Hauptstr' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ available: false, houseNumber: null, hits: [] })
  })

  it('says "not available" when the configured file cannot be read', async () => {
    process.env.STREET_DATA_PATH = join(dir, 'missing.csv')
    app = (await buildTestApp()).app
    expect((await search({ query: 'Hauptstr' })).json()).toMatchObject({ available: false })
  })

  it('rejects a missing or oversized query and a malformed postal code', async () => {
    await start(true)
    expect((await search({})).statusCode).toBe(400)
    expect((await search({ query: 'a'.repeat(121) })).statusCode).toBe(400)
    expect((await search({ query: 'Hauptstr', postalCode: '5066' })).statusCode).toBe(400)
  })

  it('offers no GET variant — the typed address never travels in a URL', async () => {
    await start(true)
    expect((await app.inject({ method: 'GET', url: '/v1/adressen/suche?query=Hauptstr' })).statusCode).toBe(404)
  })
})
