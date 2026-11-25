import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'
import { confirmAnnexOverHttp } from '../support/confirm-annex-over-http.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'

const YEAR = 2025

describe('REQ-033 — MCP-Server mit fachlichen Werkzeugen (ADR-0052 §3 / §5 / §8 / §12 / #386)', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'req-033-secret',
      BETTER_AUTH_SECRET: 'req-033-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39982',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
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
    },
  })

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
    try {
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
      expect(messageChunk).toContain('haushalt_ueberblick')
      expect(messageChunk).toContain('maske_eintragen')
      expect(messageChunk).toContain('ausdruck_vorpruefung')

      // 3. Call haushalt_ueberblick via JSON-RPC
      const standRpc = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'haushalt_ueberblick',
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
      // The read view (ADR-0052 amendment 3): no names, identifiers or street, not even masked.
      expect(standChunk).toContain('"result"')
      for (const personal of ['Markus', 'Brenner', '12345678901', '12*******01', 'Grenzacherstrasse', 'M***']) {
        expect(standChunk).not.toContain(personal)
      }

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
      const confirmRes = await confirmAnnexOverHttp(baseUrl, cookie, YEAR, 'anlageN')
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
    } finally {
      // An open event stream keeps the server from closing; release it whether the steps passed or not.
      await reader.cancel()
    }
  })
})
