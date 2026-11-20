import { Inject, Injectable, Optional } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AuditService } from '../audit/audit.service.js'
import { ChildrenService } from '../children/children.service.js'
import { CockpitService } from '../cockpit/cockpit.service.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { LinkService } from '../link/link.service.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { ReceiptService } from '../receipt/receipt.service.js'
import { UnlockService } from '../unlock/unlock.service.js'
import { registerAdviceTools } from './mcp-advice-tools.js'
import { McpReportService } from './mcp-report.service.js'
import { assertScope, type AssistantSessionInfo, type McpDeps, type McpSession } from './mcp-session.js'
import { registerChildTools } from './tools/child-tools.js'
import { registerEntryTools } from './tools/entry-tools.js'
import { registerReceiptTools } from './tools/receipt-tools.js'
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
  ) {
    this.deps = { cockpit, printout, confirmation, owlMode, receipts, unlock, profiles, masterData, audit, report, link, children }
  }

  createServer(userId: string, assistant: AssistantSessionInfo): McpServer {
    const server = new McpServer({ name: 'SteuerEule MCP Server', version: '1.0.0' })
    const session: McpSession = { server, userId, assistant }
    const { deps } = this

    registerStatusTools(session, deps)
    registerEntryTools(session, deps)
    registerReceiptTools(session, deps)
    registerAdviceTools(server, assistant, {
      requireRead: (who) => assertScope(who, 'steuerdaten:read'),
      audit: (resource) => deps.audit.append({ userId, action: 'READ', resource }),
    })
    registerReportTools(session, deps)
    registerChildTools(session, deps)

    return server
  }
}
