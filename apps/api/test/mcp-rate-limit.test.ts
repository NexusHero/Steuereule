// ADR-0052 amendment 6: at most MCP_LIMITS.toolCallsPerMinute tool calls per user per minute over MCP and
// at most MCP_LIMITS.openSessionsPerUser open SSE sessions, held in the process, never in the database.
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { limitToolCalls, MCP_LIMITS, McpRateLimiter } from '../src/mcp/mcp-rate-limit.js'

function clock(start = 1_000_000) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('McpRateLimiter', () => {
  it('names the limits in one place', () => {
    expect(MCP_LIMITS).toEqual({ toolCallsPerMinute: 120, openSessionsPerUser: 3 })
  })

  it('lets 120 calls a minute through and refuses the 121st with the seconds until the next one', () => {
    const time = clock()
    const limiter = new McpRateLimiter(time.now)
    for (let i = 0; i < 120; i += 1) {
      expect(limiter.takeToolCall('u1').ok).toBe(true)
      time.advance(100)
    }
    const refused = limiter.takeToolCall('u1')
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 48, first: true })
    expect(limiter.takeToolCall('u1')).toMatchObject({ ok: false, first: false })
    // Another user is not held up.
    expect(limiter.takeToolCall('u2').ok).toBe(true)
  })

  it('opens again as the oldest calls leave the minute (sliding window)', () => {
    const time = clock()
    const limiter = new McpRateLimiter(time.now)
    for (let i = 0; i < 120; i += 1) limiter.takeToolCall('u1')
    expect(limiter.takeToolCall('u1').ok).toBe(false)
    time.advance(60_000)
    expect(limiter.takeToolCall('u1').ok).toBe(true)
  })

  it('allows at most three open sessions per user and frees a place when one closes', () => {
    const limiter = new McpRateLimiter()
    expect(limiter.openSession('u1', 's1')).toBe(true)
    expect(limiter.openSession('u1', 's2')).toBe(true)
    expect(limiter.openSession('u1', 's3')).toBe(true)
    expect(limiter.openSession('u1', 's4')).toBe(false)
    expect(limiter.openSession('u2', 's5')).toBe(true)
    limiter.closeSession('u1', 's2')
    expect(limiter.openSession('u1', 's4')).toBe(true)
  })
})

describe('limitToolCalls', () => {
  async function connect(server: McpServer) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    return client
  }

  it('holds across two servers (sessions) of the same user, refuses in German and audits the refusal once', async () => {
    const time = clock()
    const limiter = new McpRateLimiter(time.now, { toolCallsPerMinute: 2, openSessionsPerUser: 3 })
    const refusals: string[] = []
    let ran = 0
    const make = () => {
      const server = new McpServer({ name: 't', version: '1' })
      limitToolCalls(server, limiter, 'u1', (resource) => void refusals.push(resource))
      server.tool('ping', 'ping', { n: z.number().optional() }, async () => {
        ran += 1
        return { content: [{ type: 'text' as const, text: 'pong' }] }
      })
      server.tool('pong', 'no args', async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }))
      return server
    }
    const first = await connect(make())
    const second = await connect(make())
    await first.callTool({ name: 'ping', arguments: {} })
    await second.callTool({ name: 'pong', arguments: {} })
    const refused = await second.callTool({ name: 'ping', arguments: {} })
    await first.callTool({ name: 'ping', arguments: {} })

    expect(ran).toBe(1)
    expect((refused as { isError?: boolean }).isError).toBe(true)
    const message = (refused as { content: { text: string }[] }).content[0]!.text
    expect(message).toContain('RATE_LIMITED:')
    expect(message).toMatch(/in 60 Sekunden wieder/)
    expect(refusals).toEqual(['mcp_rate_limited'])

    time.advance(60_000)
    await first.callTool({ name: 'ping', arguments: {} })
    expect(ran).toBe(2)
  })
})
