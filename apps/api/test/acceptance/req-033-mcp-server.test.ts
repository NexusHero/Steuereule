import { createHash } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-033-secret'
process.env.BETTER_AUTH_SECRET = 'req-033-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39982'
const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const YEAR = 2025

describe('REQ-033 — MCP-Server mit fachlichen Werkzeugen (ADR-0052 §3 / §5 / §8 / §12 / #386)', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    resetRateLimiters(app)
    for (const table of [
      'Kennzeichnung',
      'Lstb',
      'Kapital',
      'Rente',
      'Vermietungsobjekt',
      'Profile',
      'Stammdaten',
      'Freischaltung',
      'TaxDataAccessLog',
      'AuditEntry',
      'OauthAccessToken',
      'OauthClient',
    ]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`).catch(() => {})
    }
    await prisma.session.deleteMany().catch(() => {})
    await prisma.account.deleteMany().catch(() => {})
    await prisma.user.deleteMany().catch(() => {})
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Test User' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, userId: body.user.id }
  }

  async function createAssistantToken(
    userId: string,
    clientName = 'Claude Agent',
    scopes = ['openid', 'steuerdaten:read', 'steuerdaten:write', 'belege:write', 'zahllink:read'],
  ): Promise<{ rawToken: string; tokenHash: string; clientId: string }> {
    const rawToken = `test-bearer-${Math.random().toString(36).slice(2)}`
    const tokenHash = createHash('sha256').update(rawToken).digest('base64url')
    const clientId = `client-${Math.random().toString(36).slice(2)}`

    await prisma.oauthClient.create({
      data: {
        clientId,
        name: clientName,
        userId,
        scopes,
        redirectUris: ['http://localhost:8081/callback'],
      },
    })

    await prisma.oauthAccessToken.create({
      data: {
        token: tokenHash,
        clientId,
        userId,
        scopes,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    })

    return { rawToken, tokenHash, clientId }
  }

  it('connects to /mcp/sse, handles JSON-RPC tools, writes unconfirmed data, and verifies user confirmation flow', async () => {
    const { cookie, userId } = await signUp('mcp-user@example.com')
    const { rawToken, tokenHash } = await createAssistantToken(userId, 'Claude Agent')

    // Seed master data to test masking
    await prisma.profile.create({
      data: {
        userId,
        firstName: 'Markus',
        lastName: 'Brenner',
        steuerId: '12345678901',
      },
    })
    await prisma.masterData.create({
      data: {
        userId,
        beruf: 'Entwickler',
        strasse: 'Grenzacherstrasse',
        hausnummer: '100',
        plz: '4058',
        wohnort: 'Basel',
        iban: 'DE89370400440532013000',
      },
    })

    // 1. Establish SSE connection with Bearer token
    const sseRes = await fetch(`${baseUrl}/mcp/sse`, {
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'text/event-stream',
      },
    })
    expect(sseRes.status).toBe(200)
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream')

    const reader = sseRes.body!.getReader()
    const decoder = new TextDecoder()
    let initialChunk = ''
    while (!initialChunk.includes('event: endpoint')) {
      const { value } = await reader.read()
      initialChunk += decoder.decode(value, { stream: true })
    }

    // Extract endpoint relative URL containing sessionId
    const endpointLine = initialChunk.split('\n').find((line) => line.startsWith('data: '))
    expect(endpointLine).toBeDefined()
    const messagesEndpoint = endpointLine!.replace('data: ', '').trim()
    expect(messagesEndpoint).toContain('sessionId=')

    // 2. Call tools/list via POST /mcp/messages?sessionId=...
    const listToolsRpc = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }
    const listRes = await fetch(`${baseUrl}${messagesEndpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listToolsRpc),
    })
    expect(listRes.status).toBe(202)

    // Read response from SSE stream
    let messageChunk = ''
    while (!messageChunk.includes('"result":')) {
      const { value } = await reader.read()
      messageChunk += decoder.decode(value, { stream: true })
    }
    expect(messageChunk).toContain('steuerjahr_stand')
    expect(messageChunk).toContain('maske_eintragen')
    expect(messageChunk).toContain('ausdruck_vorpruefung')

    // 3. Call steuerjahr_stand via JSON-RPC
    const standRpc = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'steuerjahr_stand',
        arguments: { taxYear: YEAR },
      },
    }
    await fetch(`${baseUrl}${messagesEndpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(standRpc),
    })

    let standChunk = ''
    while (!standChunk.includes('"id":2') && !standChunk.includes('"id": 2')) {
      const { value } = await reader.read()
      standChunk += decoder.decode(value, { stream: true })
    }
    // Verify PII is masked
    expect(standChunk).toContain('12*******01')
    expect(standChunk).toContain('M***')
    expect(standChunk).toContain('B***')
    expect(standChunk).toContain('G***')
    expect(standChunk).not.toContain('Grenzacherstrasse')
    expect(standChunk).not.toContain('12345678901')

    // 4. Call maske_eintragen via JSON-RPC (writing unconfirmed value)
    const writeRpc = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'maske_eintragen',
        arguments: {
          taxYear: YEAR,
          screen: 'lstb',
          field: 'bruttoarbeitslohn',
          value: '75000',
        },
      },
    }
    await fetch(`${baseUrl}${messagesEndpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(writeRpc),
    })

    let writeChunk = ''
    while (!writeChunk.includes('"id":3') && !writeChunk.includes('"id": 3')) {
      const { value } = await reader.read()
      writeChunk += decoder.decode(value, { stream: true })
    }
    expect(writeChunk).toContain('geschrieben')

    // 5. Verify unconfirmed value via user's REST endpoint
    const overviewRes = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/bestaetigung`, {
      headers: { cookie },
    })
    expect(overviewRes.status).toBe(200)
    const overviewBody = (await overviewRes.json()) as {
      annexes: Array<{
        annex: string
        unconfirmed: number
        values: Array<{ value: string; provenance: { kind: string; name: string } }>
      }>
    }
    expect(overviewBody.annexes).toHaveLength(1)
    const anlageN = overviewBody.annexes[0]!
    expect(anlageN.annex).toBe('anlageN')
    expect(anlageN.unconfirmed).toBe(1)
    expect(anlageN.values[0]!.value).toBe('75000')
    expect(anlageN.values[0]!.provenance).toEqual({
      kind: 'assistent',
      name: 'Claude Agent',
    })

    // 6. User confirms Anlage N in the app
    const confirmRes = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/bestaetigung/anlagen/anlageN`, {
      method: 'PUT',
      headers: { cookie },
    })
    expect(confirmRes.status).toBe(200)
    const confirmedBody = (await confirmRes.json()) as { annexes: unknown[] }
    expect(confirmedBody.annexes).toEqual([])

    // 7. Revoke OAuth token
    await prisma.oauthAccessToken.update({
      where: { token: tokenHash },
      data: { revoked: new Date() },
    })

    // Revoked token receives 401 Unauthorized
    const revokedSseRes = await fetch(`${baseUrl}/mcp/sse`, {
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'text/event-stream',
      },
    })
    expect(revokedSseRes.status).toBe(401)

    // 8. Forbidden actions remain forbidden for assistant tokens (ADR-0052 §4)
    const { rawToken: freshToken } = await createAssistantToken(userId, 'Active Assistant')
    const deleteAccountRes = await fetch(`${baseUrl}/v1/account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${freshToken}`,
      },
    })
    expect(deleteAccountRes.status).toBe(403)

    await reader.cancel()
  })
})
