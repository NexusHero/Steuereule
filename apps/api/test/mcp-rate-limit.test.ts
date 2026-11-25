// ADR-0052 amendment 6: at most MCP_LIMITS.toolCallsPerMinute tool calls per user per minute over MCP and
// at most MCP_LIMITS.openSessionsPerUser open SSE sessions, held in the process, never in the database.
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'
import { MCP_CHECKOUT_LINK_LIMIT, MCP_LIMITS, McpRateLimiter } from '../src/mcp/mcp-rate-limit.js'
import { installToolGate, MCP_SCOPE } from '../src/mcp/tool-kit.js'

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

// ADR-0052 amendment 9: the window in the process let every instance count alone, so three instances gave a
// user three times the limit. With a shared counter the instances hold one limit together.
describe('McpRateLimiter with a shared counter', () => {
  it('two instances together let the limit through once, not once each', async () => {
    const shared = createResettableRateLimitStorage({ redisUrl: '' })
    const limits = { toolCallsPerMinute: 4, openSessionsPerUser: 3 }
    const [one, two] = [new McpRateLimiter(Date.now, limits, shared), new McpRateLimiter(Date.now, limits, shared)]

    const gates = []
    for (let i = 0; i < 3; i += 1) gates.push(await one.takeToolCallEverywhere('u1'), await two.takeToolCallEverywhere('u1'))

    expect(gates.map((gate) => gate.ok)).toEqual([true, true, true, true, false, false])
    expect(gates[4]).toMatchObject({ ok: false, first: true })
    // The process still has budget of its own, so only the shared counter refuses: the stretch is audited once.
    expect(await one.takeToolCallEverywhere('u1')).toMatchObject({ ok: false, first: false })
    // Another user is not held up.
    expect((await two.takeToolCallEverywhere('u2')).ok).toBe(true)
  })

  it('without a shared counter it is the window of the process alone', async () => {
    const limiter = new McpRateLimiter(Date.now, { toolCallsPerMinute: 1, openSessionsPerUser: 3 })
    expect((await limiter.takeToolCallEverywhere('u1')).ok).toBe(true)
    expect(await limiter.takeToolCallEverywhere('u1')).toMatchObject({ ok: false, first: true })
  })
})

describe('checkout links per account (ADR-0052 amendment 9)', () => {
  it('gives five an hour and refuses the sixth with the wait, per account', async () => {
    const time = clock()
    const limiter = new McpRateLimiter(time.now)
    for (let i = 0; i < MCP_CHECKOUT_LINK_LIMIT.max; i += 1) expect((await limiter.takeCheckoutLink('u1')).ok).toBe(true)
    expect(await limiter.takeCheckoutLink('u1')).toEqual({ ok: false, retryAfterSeconds: 3600 })
    expect((await limiter.takeCheckoutLink('u2')).ok).toBe(true)
    time.advance(60 * 60 * 1000)
    expect((await limiter.takeCheckoutLink('u1')).ok).toBe(true)
  })

  it('counts in the shared counter across instances', async () => {
    const shared = createResettableRateLimitStorage({ redisUrl: '' })
    const [one, two] = [new McpRateLimiter(Date.now, MCP_LIMITS, shared), new McpRateLimiter(Date.now, MCP_LIMITS, shared)]
    for (let i = 0; i < MCP_CHECKOUT_LINK_LIMIT.max; i += 1) expect((await (i % 2 ? one : two).takeCheckoutLink('u1')).ok).toBe(true)
    expect((await one.takeCheckoutLink('u1')).ok).toBe(false)
  })
})

describe('the tool gate: call limit', () => {
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
      const audit = { append: async (entry: { resource: string }) => void (entry.resource === 'mcp_rate_limited' && refusals.push(entry.resource)) }
      installToolGate(server, { userId: 'u1', assistant: { clientId: 'c', clientName: 'C', scopes: [MCP_SCOPE.read] }, limiter, audit })
      // Two real tool names, so both have a policy; the handlers are stand-ins.
      server.tool('wechselkurs', 'ping', { n: z.number().min(0).max(1).optional() }, async () => {
        ran += 1
        return { content: [{ type: 'text' as const, text: 'pong' }] }
      })
      server.tool('feld_finden', 'no args', {}, async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }))
      return server
    }
    const first = await connect(make())
    const second = await connect(make())
    await first.callTool({ name: 'wechselkurs', arguments: {} })
    await second.callTool({ name: 'feld_finden', arguments: {} })
    const refused = await second.callTool({ name: 'wechselkurs', arguments: {} })
    await first.callTool({ name: 'wechselkurs', arguments: {} })

    expect(ran).toBe(1)
    expect((refused as { isError?: boolean }).isError).toBe(true)
    const message = (refused as { content: { text: string }[] }).content[0]!.text
    expect(message).toContain('RATE_LIMITED:')
    expect(message).toMatch(/in 60 Sekunden wieder/)
    expect(refusals).toEqual(['mcp_rate_limited'])

    time.advance(60_000)
    await first.callTool({ name: 'wechselkurs', arguments: {} })
    expect(ran).toBe(2)
  })
})
