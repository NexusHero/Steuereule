import { Inject, Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAdviceTools } from './mcp-advice-tools.js'
import { McpRateLimiter } from './mcp-rate-limit.js'
import { McpReportService } from './mcp-report.service.js'
import { MCP_DEPS, type AssistantSessionInfo, type McpDeps, type McpSession } from './mcp-session.js'
import { SERVER_INSTRUCTIONS } from './server-instructions.js'
import { installToolGate } from './tool-gate.js'
import { registerBookingTools } from './tools/booking-tools.js'
import { registerChildTools } from './tools/child-tools.js'
import { registerComparisonTools } from './tools/comparison-tools.js'
import { registerComfortTools } from './tools/comfort-tools.js'
import { registerEntryTools } from './tools/entry-tools.js'
import { registerReadTools } from './tools/read-tools.js'
import { registerReceiptTools } from './tools/receipt-tools.js'
import { registerRentalTools } from './tools/rental-tools.js'
import { registerTaskTools } from './tools/task-tools.js'
import { registerReportTools, registerStatusTools } from './tools/status-tools.js'

export type { AssistantSessionInfo } from './mcp-session.js'

/**
 * Remote MCP server with domain tools for the user's own assistant. The tools live in `tools/`, one
 * file per group; this class builds a server per connection over the collaborators `mcpDepsProvider` gathers.
 * Traces to: ADR-0052 §3 (Werkzeuge), §5 (Bezahlung), §8 (Maskierung), §12 (Eulen-Modus), amendments 2–3.
 */
@Injectable()
export class McpService {
  constructor(
    @Inject(MCP_DEPS) private readonly deps: McpDeps,
    /** One per process, shared by every connection: the limit holds across a user's sessions. */
    @Inject(McpRateLimiter) private readonly limiter: McpRateLimiter,
  ) {}

  createServer(userId: string, assistant: AssistantSessionInfo): McpServer {
    // The workflow in a few lines on `initialize`, so a client knows where to start (MCP-10).
    const server = new McpServer({ name: 'SteuerEule MCP Server', version: '1.0.0' }, { instructions: SERVER_INSTRUCTIONS })
    const session: McpSession = { server, userId, assistant }
    const { deps } = this
    // First, so every tool registered below passes the one gate: limit, scope, audit with the assistant, error shape.
    installToolGate(server, { userId, assistant, limiter: this.limiter, audit: deps.audit })

    registerStatusTools(session, deps)
    registerReadTools(session, deps)
    registerEntryTools(session, deps)
    registerReceiptTools(session, deps)
    registerAdviceTools(server)
    registerReportTools(session, deps)
    registerChildTools(session, deps)
    registerComfortTools(session, deps)
    registerRentalTools(session, deps)
    registerTaskTools(session, deps)
    registerBookingTools(session, deps)
    registerComparisonTools(session, deps)

    return server
  }
}
