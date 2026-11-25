// ADR-0052 amendment 6: at most MCP_LIMITS.toolCallsPerMinute tool calls per user per minute over MCP and
// at most MCP_LIMITS.openSessionsPerUser open SSE sessions, held in the process, never in the database.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'
import { MCP_CHECKOUT_LINK_LIMIT, MCP_LIMITS, MCP_TOOL_BUDGETS, McpRateLimiter, type ToolBudget } from '../src/mcp/mcp-rate-limit.js'
import { MCP_SCOPE, TOOL_POLICIES } from '../src/mcp/tool-kit.js'
import { connectMcpTools } from './support/mcp-client.js'

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
    for (let i = 0; i < MCP_CHECKOUT_LINK_LIMIT.max; i += 1) expect((await limiter.takeBudget('checkoutLink', 'u1')).ok).toBe(true)
    expect(await limiter.takeBudget('checkoutLink', 'u1')).toEqual({ ok: false, retryAfterSeconds: 3600 })
    expect((await limiter.takeBudget('checkoutLink', 'u2')).ok).toBe(true)
    time.advance(60 * 60 * 1000)
    expect((await limiter.takeBudget('checkoutLink', 'u1')).ok).toBe(true)
  })

  it('counts in the shared counter across instances', async () => {
    const shared = createResettableRateLimitStorage({ redisUrl: '' })
    const [one, two] = [new McpRateLimiter(Date.now, MCP_LIMITS, shared), new McpRateLimiter(Date.now, MCP_LIMITS, shared)]
    for (let i = 0; i < MCP_CHECKOUT_LINK_LIMIT.max; i += 1) expect((await (i % 2 ? one : two).takeBudget('checkoutLink', 'u1')).ok).toBe(true)
    expect((await one.takeBudget('checkoutLink', 'u1')).ok).toBe(false)
  })
})

const pong = async () => ({ content: [{ type: 'text' as const, text: '{"ok":true}' }] })

describe('the tool gate: call limit', () => {
  it('holds across two servers (sessions) of the same user, refuses in German and audits the refusal once', async () => {
    const time = clock()
    const limiter = new McpRateLimiter(time.now, { toolCallsPerMinute: 2, openSessionsPerUser: 3 })
    const refusals: string[] = []
    let ran = 0
    const audit = { append: async (entry: { resource: string }) => void (entry.resource === 'mcp_rate_limited' && refusals.push(entry.resource)) }
    const connect = () =>
      connectMcpTools(
        ({ server }) => {
          // Two real tool names, so both have a policy; the handlers are stand-ins.
          server.tool('wechselkurs', 'ping', { n: z.number().min(0).max(1).optional() }, async () => {
            ran += 1
            return pong()
          })
          server.tool('feld_finden', 'no args', {}, pong)
        },
        { userId: 'u1', assistant: { clientId: 'c', clientName: 'C', scopes: [MCP_SCOPE.read] }, limiter, deps: { audit: audit as never } },
      )
    const first = await connect()
    const second = await connect()
    await first.call('wechselkurs')
    await second.call('feld_finden')
    const refused = await second.call('wechselkurs')
    await first.call('wechselkurs')

    expect(ran).toBe(1)
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('RATE_LIMITED:')
    expect(refused.text).toMatch(/in 60 Sekunden wieder/)
    expect(refusals).toEqual(['mcp_rate_limited'])

    time.advance(60_000)
    await first.call('wechselkurs')
    expect(ran).toBe(2)
  })
})

describe('the tool gate: the budget a policy names', () => {
  const refusals: Readonly<Record<ToolBudget, { code: string; says: string[] }>> = {
    printout: { code: 'PRINTOUT_BUDGET', says: ['Die Ausdruck-Prüfung lief in der letzten Minute schon oft', 'in 60 Sekunden wieder'] },
    checkoutLink: { code: 'RATE_LIMITED', says: ['in der letzten Stunde schon 5 Zahllinks angefordert', 'Gib dem Nutzer den zuletzt erhaltenen Link', 'in 60 Minuten wieder'] },
    receiptUpload: { code: 'RATE_LIMITED', says: ['Über diesen Zugang wurden gerade viele Belege hochgeladen', 'in 10 Minuten wieder'] },
  }

  for (const budget of Object.keys(MCP_TOOL_BUDGETS) as ToolBudget[]) {
    it(`${budget}: the tools that name it share it per account, and the call over it is refused before the tool runs`, async () => {
      const names = Object.keys(TOOL_POLICIES).filter((name) => TOOL_POLICIES[name]!.budget === budget)
      expect(names.length).toBeGreaterThan(0)
      const { max, window } = MCP_TOOL_BUDGETS[budget]
      const time = clock()
      // The call limit is out of the way: only the budget can refuse.
      const limiter = new McpRateLimiter(time.now, { toolCallsPerMinute: 10_000, openSessionsPerUser: 3 })
      const ran: string[] = []
      const connect = (userId: string) =>
        connectMcpTools(
          ({ server }) => {
            for (const name of names) {
              server.tool(name, 'stand-in', {}, async () => {
                ran.push(`${userId}:${name}`)
                return pong()
              })
            }
          },
          { userId, limiter },
        )
      const { call } = await connect('u1')

      for (let i = 0; i < max; i += 1) expect((await call(names[i % names.length]!)).isError).toBe(false)
      const over = await call(names[0]!)
      expect(over.isError).toBe(true)
      expect(over.body.code).toBe(refusals[budget].code)
      for (const text of refusals[budget].says) expect(over.body.error).toContain(text)
      expect((over.body.naechsterSchritt as string).length).toBeGreaterThan(10)
      expect(ran).toHaveLength(max)

      // Another account has its own budget; this one opens again when the window has passed.
      expect((await (await connect('u2')).call(names[0]!)).isError).toBe(false)
      time.advance(window * 1000)
      expect((await call(names[0]!)).isError).toBe(false)
    })
  }

  it('a call the scope check refuses does not use the budget up', async () => {
    const limiter = new McpRateLimiter()
    const { call } = await connectMcpTools(({ server }) => void server.tool('zahllink_anfordern', 'stand-in', {}, pong), { userId: 'u1', assistant: { clientId: 'c', clientName: 'C', scopes: [] }, limiter })
    for (let i = 0; i < MCP_CHECKOUT_LINK_LIMIT.max + 1; i += 1) expect((await call('zahllink_anfordern')).body.code).toBe('MISSING_SCOPE')
    expect((await limiter.takeBudget('checkoutLink', 'u1')).ok).toBe(true)
  })
})
