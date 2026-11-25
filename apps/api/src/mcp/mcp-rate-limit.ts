import { Injectable } from '@nestjs/common'

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

/**
 * The tools that render the whole printout once nothing is missing (`ausdruck_vorpruefung`, `steuerbericht`,
 * `pruefen`; beta P4 H2-26): a few a minute, together, instead of 120. A run checks after a batch of entries,
 * not after every one.
 */
export const MCP_PRINTOUT_CHECK_LIMIT = { window: 60, max: 10 } as const

/**
 * Receipt uploads one account's assistants may make: the same budget as the REST upload route
 * (`RECEIPT_UPLOAD_THROTTLE`, 60 per 10 minutes), which an MCP call does not pass through.
 */
export const MCP_RECEIPT_UPLOAD_LIMIT = { window: 10 * 60, max: 60 } as const

export type Budget = { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number }

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
  private readonly budgets = new Map<string, number[]>()

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
  takeCheckoutLink(userId: string): Promise<Budget> {
    return this.takeBudget('mcp-checkout-link', userId, MCP_CHECKOUT_LINK_LIMIT)
  }

  /** Whether the account may run one more printout-rendering check this minute (H2-26). */
  takePrintoutCheck(userId: string): Promise<Budget> {
    return this.takeBudget('mcp-printout-check', userId, MCP_PRINTOUT_CHECK_LIMIT)
  }

  /** Whether the account may upload one more receipt through the MCP endpoint in this window. */
  takeReceiptUpload(userId: string): Promise<Budget> {
    return this.takeBudget('mcp-receipt-upload', userId, MCP_RECEIPT_UPLOAD_LIMIT)
  }

  /** A budget per account and kind: in the shared counter when there is one, else a sliding window in this process. */
  private async takeBudget(kind: string, userId: string, rule: { readonly window: number; readonly max: number }): Promise<Budget> {
    if (this.shared) {
      const decision = await this.shared.consume(`${kind}:${userId}`, rule)
      return decision.allowed ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, decision.retryAfter ?? rule.window) }
    }
    const key = `${kind}:${userId}`
    const now = this.now()
    const recent = (this.budgets.get(key) ?? []).filter((at) => at > now - rule.window * 1000)
    if (recent.length >= rule.max) {
      this.budgets.set(key, recent)
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + rule.window * 1000 - now) / 1000)) }
    }
    recent.push(now)
    this.budgets.set(key, recent)
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
    // The longest budget window is an hour: a key whose last entry is older holds nothing any more.
    for (const [key, times] of this.budgets) {
      if ((times.at(-1) ?? 0) <= now - MCP_CHECKOUT_LINK_LIMIT.window * 1000) this.budgets.delete(key)
    }
  }
}
