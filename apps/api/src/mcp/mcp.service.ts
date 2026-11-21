import { Inject, Injectable, Optional } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AssistantTaskService } from '../assistant-task/assistant-task.service.js'
import { AuditService } from '../audit/audit.service.js'
import { BusinessService } from '../business/business.service.js'
import { ChildrenService } from '../children/children.service.js'
import { CockpitService } from '../cockpit/cockpit.service.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { DeadlinesService } from '../deadlines/deadlines.service.js'
import { LinkService } from '../link/link.service.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { ReceiptService } from '../receipt/receipt.service.js'
import { RENTAL_REPOSITORY } from '../rental/rental.repository.js'
import { UnlockService } from '../unlock/unlock.service.js'
import { registerAdviceTools } from './mcp-advice-tools.js'
import { McpRateLimiter, limitToolCalls } from './mcp-rate-limit.js'
import { McpReportService } from './mcp-report.service.js'
import { assertScope, type AssistantSessionInfo, type McpDeps, type McpSession } from './mcp-session.js'
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
 * file per group; this class only gathers what they need and builds a server per connection.
 * Traces to: ADR-0052 §3 (Werkzeuge), §5 (Bezahlung), §8 (Maskierung), §12 (Eulen-Modus), amendments 2–3.
 */
@Injectable()
export class McpService {
  private readonly deps: McpDeps
  private readonly limiter: McpRateLimiter

  constructor(
    @Inject(CockpitService) cockpit: CockpitService,
    @Inject(PrintoutService) printout: PrintoutService,
    @Inject(ConfirmationService) confirmation: ConfirmationService,
    @Inject(OwlModeService) owlMode: OwlModeService,
    @Inject(ReceiptService) receipts: ReceiptService,
    @Inject(UnlockService) unlock: UnlockService,
    @Inject(PROFILE_REPOSITORY) profiles: ProfileRepository,
    @Inject(MASTER_DATA_REPOSITORY) masterData: MasterDataRepository,
    @Inject(AuditService) audit: AuditService,
    @Optional() @Inject(McpReportService) report?: McpReportService,
    @Optional() @Inject(LinkService) link?: McpDeps['link'],
    @Optional() @Inject(ChildrenService) children?: McpDeps['children'],
    @Optional() @Inject(DeadlinesService) deadlines?: McpDeps['deadlines'],
    @Optional() @Inject(RENTAL_REPOSITORY) rentals?: McpDeps['rentals'],
    @Optional() @Inject(AssistantTaskService) tasks?: McpDeps['tasks'],
    @Optional() @Inject(BusinessService) business?: McpDeps['business'],
    /** One per process, shared by every connection: the limit holds across a user's sessions. */
    @Optional() @Inject(McpRateLimiter) limiter?: McpRateLimiter,
  ) {
    this.deps = { cockpit, printout, confirmation, owlMode, receipts, unlock, profiles, masterData, audit, report, link, children, deadlines, rentals, tasks, business }
    this.limiter = limiter ?? new McpRateLimiter()
  }

  createServer(userId: string, assistant: AssistantSessionInfo): McpServer {
    const server = new McpServer({ name: 'SteuerEule MCP Server', version: '1.0.0' })
    const session: McpSession = { server, userId, assistant }
    const { deps } = this
    // First, so every tool registered below passes the limit (ADR-0052 amendment 6).
    limitToolCalls(server, this.limiter, userId, (resource) => deps.audit.append({ userId, action: 'READ', resource }))

    registerStatusTools(session, deps)
    registerReadTools(session, deps)
    registerEntryTools(session, deps)
    registerReceiptTools(session, deps)
    registerAdviceTools(server, assistant, {
      requireRead: (who) => assertScope(who, 'steuerdaten:read'),
      audit: (resource) => deps.audit.append({ userId, action: 'READ', resource }),
    })
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
