import { Injectable } from '@nestjs/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { refused } from './mcp-session.js'

/**
 * How much one user's assistants may ask of the MCP endpoint (ADR-0052 amendments 6 and 9). Per user, across
 * all of their sessions and clients. The tool calls are counted in this process and, where the limiter is
 * given a shared counter, across all instances too; the open SSE sessions live in one process and are
 * counted there.
 */
export const MCP_LIMITS = { toolCallsPerMinute: 120, openSessionsPerUser: 3 } as const

/**
 * Checkout links one account's assistants may ask for (ADR-0052 amendment 9). Every link is a new checkout
 * session at the payment provider; a user pays once per tax year, so a handful an hour covers every retry.
 */
export const MCP_CHECKOUT_LINK_LIMIT = { window: 60 * 60, max: 5 } as const

/** A counter all instances share (the rate-limit storage of ADR-0106); it falls back to this process without Redis. */
export interface SharedCounter {
  consume(key: string, rule: { window: number; max: number }): Promise<{ allowed: boolean; retryAfter: number | null }>
}

export interface McpLimits {
  readonly toolCallsPerMinute: number
  readonly openSessionsPerUser: number
}

const WINDOW_MS = 60_000

export type ToolCallGate = { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number; readonly first: boolean }

/**
 * A sliding window of the calls of the last minute per user, and the open SSE sessions per user. The window
 * is in memory: it refuses a flood without a round trip. A call it lets through is then counted in the shared
 * counter, when there is one, so that several instances together hold the same limit.
 */
@Injectable()
export class McpRateLimiter {
  private readonly calls = new Map<string, number[]>()
  private readonly blocked = new Set<string>()
  private readonly sessions = new Map<string, Set<string>>()
  private readonly checkoutLinks = new Map<string, number[]>()

  constructor(
    private readonly now: () => number = Date.now,
    readonly limits: McpLimits = MCP_LIMITS,
    private readonly shared?: SharedCounter,
  ) {}

  /**
   * The gate of a tool call: this process's window first, then the shared count of the minute. Without a
   * shared counter it is `takeToolCall` alone.
   */
  async takeToolCallEverywhere(userId: string): Promise<ToolCallGate> {
    // Read before the local take: a call the process lets through clears `blocked`, and a stretch the shared
    // counter keeps refusing would otherwise look new on every retry and be audited each time.
    const alreadyBlocked = this.blocked.has(userId)
    const local = this.takeToolCall(userId)
    if (!local.ok || !this.shared) return local
    const decision = await this.shared.consume(`mcp-tool-calls:${userId}`, { window: WINDOW_MS / 1000, max: this.limits.toolCallsPerMinute })
    if (decision.allowed) return local
    const first = !alreadyBlocked
    this.blocked.add(userId)
    return { ok: false, retryAfterSeconds: Math.max(1, decision.retryAfter ?? WINDOW_MS / 1000), first }
  }

  /** Whether the account may get one more checkout link this hour; counted in this process without a shared counter. */
  async takeCheckoutLink(userId: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number }> {
    const rule = MCP_CHECKOUT_LINK_LIMIT
    if (this.shared) {
      const decision = await this.shared.consume(`mcp-checkout-link:${userId}`, rule)
      return decision.allowed ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, decision.retryAfter ?? rule.window) }
    }
    const now = this.now()
    const recent = (this.checkoutLinks.get(userId) ?? []).filter((at) => at > now - rule.window * 1000)
    if (recent.length >= rule.max) {
      this.checkoutLinks.set(userId, recent)
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + rule.window * 1000 - now) / 1000)) }
    }
    recent.push(now)
    this.checkoutLinks.set(userId, recent)
    return { ok: true }
  }

  takeToolCall(userId: string): ToolCallGate {
    const now = this.now()
    const recent = (this.calls.get(userId) ?? []).filter((at) => at > now - WINDOW_MS)
    if (recent.length >= this.limits.toolCallsPerMinute) {
      this.calls.set(userId, recent)
      const first = !this.blocked.has(userId)
      this.blocked.add(userId)
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + WINDOW_MS - now) / 1000)), first }
    }
    recent.push(now)
    this.calls.set(userId, recent)
    this.blocked.delete(userId)
    this.forgetIdle(now)
    return { ok: true }
  }

  /** Whether one more SSE session may open for the user; an accepted one counts until `closeSession`. */
  openSession(userId: string, sessionId: string): boolean {
    const open = this.sessions.get(userId) ?? new Set<string>()
    if (open.size >= this.limits.openSessionsPerUser) return false
    open.add(sessionId)
    this.sessions.set(userId, open)
    return true
  }

  closeSession(userId: string, sessionId: string): void {
    const open = this.sessions.get(userId)
    if (!open) return
    open.delete(sessionId)
    if (open.size === 0) this.sessions.delete(userId)
  }

  /** Drops users whose last call left the window, so the map does not grow with every user ever seen. */
  private forgetIdle(now: number): void {
    if (this.calls.size < 1000) return
    for (const [userId, times] of this.calls) {
      if ((times.at(-1) ?? 0) <= now - WINDOW_MS) {
        this.calls.delete(userId)
        this.blocked.delete(userId)
      }
    }
  }
}

/** The German refusal of a call over the limit. */
export const rateLimitRefusal = (retryAfterSeconds: number, perMinute: number = MCP_LIMITS.toolCallsPerMinute) =>
  refused(`RATE_LIMITED: Zu viele Werkzeugaufrufe (höchstens ${perMinute} je Minute). Versuch es in ${retryAfterSeconds} Sekunden wieder und fasse Einträge mit maske_eintragen_stapel zusammen.`)

/**
 * Puts the limit in front of every tool registered on this server from now on: one gate where all tools pass,
 * so no tool group can forget it. The first refusal of a blocked stretch is audited (`onRefusal`); the rest
 * are not, so a client hammering the endpoint cannot turn the limit into a stream of database writes.
 */
export function limitToolCalls(server: McpServer, limiter: McpRateLimiter, userId: string, onRefusal: (resource: string) => void | Promise<void>): void {
  const register = server.tool.bind(server) as (...args: unknown[]) => unknown
  const gated = (...args: unknown[]): unknown => {
    const handler = args.at(-1)
    if (typeof handler !== 'function') return register(...args)
    const guarded = async (...callArgs: unknown[]) => {
      const gate = await limiter.takeToolCallEverywhere(userId)
      if (!gate.ok) {
        if (gate.first) await onRefusal('mcp_rate_limited')
        return rateLimitRefusal(gate.retryAfterSeconds, limiter.limits.toolCallsPerMinute)
      }
      return (handler as (...a: unknown[]) => unknown)(...callArgs)
    }
    return register(...args.slice(0, -1), guarded)
  }
  server.tool = gated as McpServer['tool']
}
