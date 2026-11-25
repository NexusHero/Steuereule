import { Logger } from '@nestjs/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import { assistantAuditSource, runWithAuditSource } from '../audit/audit-source.js'
import type { AuditService } from '../audit/audit.service.js'
import { hasScope } from '../common/assistant-scopes.js'
import type { McpRateLimiter } from './mcp-rate-limit.js'
import type { AssistantSessionInfo } from './mcp-session.js'
import { unboundedArguments } from './tool-args.js'
import { annotationsOf, TOOL_POLICIES } from './tool-policies.js'
import { BUDGET_REFUSALS, normalisedResult, rateLimitRefusal, refusalOfError, refusalOfProtocolError, refused, type ToolResult } from './tool-results.js'

/**
 * The gate every MCP tool passes (beta P4): a tool file says what the tool does; the gate decides whether the
 * call runs (limit, scope, budget), writes its audit row with the assistant, and turns whatever comes back — a
 * refusal, an `ok: false`, a thrown error — into `isError` with a code and a next step. Traces to: ADR-0052
 * §4, §10, amendments 2, 6 and 9.
 */

export interface ToolGateContext {
  readonly userId: string
  readonly assistant: AssistantSessionInfo
  readonly limiter: Pick<McpRateLimiter, 'takeToolCallEverywhere' | 'takeBudget' | 'limits'>
  readonly audit: Pick<AuditService, 'append'>
}

type ToolHandler = (args: Record<string, unknown>, extra: unknown) => unknown

const logger = new Logger('McpTools')

/**
 * Every tool registered on this server from now on passes here (one place, so no tool can forget a step):
 * its policy and bounded arguments are checked when it is registered; each call is limited, audited with
 * the assistant, scope-checked, counted against the budget its policy names and answered in one shape. Registration takes the four-argument form
 * `server.tool(name, description, shape, handler)`.
 */
export function installToolGate(server: McpServer, context: ToolGateContext): void {
  const { userId, assistant, limiter, audit } = context
  const source = assistantAuditSource(assistant.clientId)
  const register = server.registerTool.bind(server) as (name: string, config: Record<string, unknown>, handler: ToolHandler) => unknown

  const gated = (name: string, description: string, shape: Record<string, z.ZodType>, handler: ToolHandler): unknown => {
    const policy = TOOL_POLICIES[name]
    if (policy === undefined) throw new Error(`MCP tool "${name}" has no entry in TOOL_POLICIES.`)
    if (typeof handler !== 'function' || typeof description !== 'string') throw new Error(`MCP tool "${name}" must be registered as tool(name, description, shape, handler).`)
    const unbounded = unboundedArguments(shape)
    if (unbounded.length > 0) throw new Error(`MCP tool "${name}" takes unbounded arguments: ${unbounded.join(', ')}.`)

    const guarded: ToolHandler = async (args, extra) => {
      const gate = await limiter.takeToolCallEverywhere(userId)
      if (!gate.ok) {
        // The first refusal of a blocked stretch only: a client hammering the endpoint writes no stream of rows.
        if (gate.first) await audit.append({ userId, action: 'READ', resource: 'mcp_rate_limited', source }).catch(() => undefined)
        return rateLimitRefusal(gate.retryAfterSeconds, limiter.limits.toolCallsPerMinute)
      }
      try {
        await audit.append({ userId, action: policy.kind === 'read' ? 'READ' : 'WRITE', resource: name, source })
        if (!hasScope(assistant, policy.scope)) {
          return refused(`MISSING_SCOPE: Dem Assistenten wurde die Berechtigung „${policy.scope}“ nicht erteilt; ${name} braucht sie.`)
        }
        if (policy.budget !== undefined) {
          const budget = await limiter.takeBudget(policy.budget, userId)
          if (!budget.ok) return refused(BUDGET_REFUSALS[policy.budget](budget.retryAfterSeconds))
        }
        return normalisedResult(await runWithAuditSource(source, () => handler(args, extra)))
      } catch (error) {
        return refusalOfError(error, (message) => logger.error(`${name}: ${message}`))
      }
    }
    return register(name, { title: policy.title, description, inputSchema: shape, annotations: annotationsOf(policy) }, guarded)
  }
  server.tool = gated as unknown as McpServer['tool']
  // Arguments that fail the schema and unknown tools are answered by the SDK itself: in the same shape.
  ;(server as unknown as { createToolError: (message: string) => ToolResult }).createToolError = refusalOfProtocolError
}
