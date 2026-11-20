import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkDraftPerson, PERSON_B_HANDLE, type AdvisorHousehold, type Screen } from '@steuereule/core'
import type { AuditService } from '../audit/audit.service.js'
import type { ChildrenService } from '../children/children.service.js'
import type { CockpitService } from '../cockpit/cockpit.service.js'
import type { DeadlinesService } from '../deadlines/deadlines.service.js'
import type { RentalRepository } from '../rental/rental.repository.js'
import type { ConfirmationService } from '../confirmation/confirmation.service.js'
import type { LinkService } from '../link/link.service.js'
import type { MasterDataRepository } from '../master-data/master-data.repository.js'
import type { OwlModeService } from '../owl-mode/owl-mode.service.js'
import type { PrintoutService } from '../printout/printout.service.js'
import type { ProfileRepository } from '../profile/profile.repository.js'
import type { ReceiptService } from '../receipt/receipt.service.js'
import type { UnlockService } from '../unlock/unlock.service.js'
import type { McpReportService } from './mcp-report.service.js'

export interface AssistantSessionInfo {
  readonly clientId: string
  readonly clientName: string
  readonly scopes: readonly string[]
}

/** One connected assistant: its server, the user it acts for, and what it was granted. */
export interface McpSession {
  readonly server: McpServer
  readonly userId: string
  readonly assistant: AssistantSessionInfo
}

/** The services the tool groups work with; optional ones switch their tools off when absent. */
export interface McpDeps {
  readonly cockpit: CockpitService
  readonly printout: PrintoutService
  readonly confirmation: ConfirmationService
  readonly owlMode: OwlModeService
  readonly receipts: ReceiptService
  readonly unlock: UnlockService
  readonly profiles: ProfileRepository
  readonly masterData: MasterDataRepository
  readonly audit: AuditService
  readonly report?: McpReportService | undefined
  /** The joint return (ADR-0054): whose data a value for Person B goes to. */
  readonly link?: Pick<LinkService, 'spouseForAdvisor' | 'dataUser'> | undefined
  /** A child is a record of its own: the mask `kind` needs its id as `instance`. */
  readonly children?: Pick<ChildrenService, 'list' | 'create' | 'delete'> | undefined
  readonly deadlines?: Pick<DeadlinesService, 'getDeadlines'> | undefined
  /** A rental object is a record of its own: the mask `vermietung` needs its id as `instance`. */
  readonly rentals?: Pick<RentalRepository, 'listForUserAndYear' | 'create' | 'delete'> | undefined
}

export function assertScope(assistant: AssistantSessionInfo, requiredScope: string): void {
  if (!assistant.scopes.includes(requiredScope)) {
    throw new Error(`Fehlender OAuth-Scope: ${requiredScope}. Dem Assistenten wurde diese Berechtigung nicht erteilt.`)
  }
}

/** A tool answer as the JSON text an MCP client reads. */
export const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })

/** A refusal the assistant can act on: `CODE: reason`, flagged as an error. */
export const refused = (error: string) => ({ isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error }, null, 2) }] })

/**
 * Whose data an entry writes, with the in-app advisor's rules (`checkDraftPerson`): Person B only in a
 * joint return the user records for, only on B's own masks, and on those masks the person is required.
 */
export async function dataUserFor(
  link: McpDeps['link'],
  userId: string,
  taxYear: number,
  screen: Screen,
  field: string,
  person: 'A' | 'B' | undefined,
): Promise<{ ok: true; dataUserId: string } | { ok: false; error: string }> {
  const spouse = await link?.spouseForAdvisor(userId, taxYear)
  const household: AdvisorHousehold = { personB: spouse ? { handle: PERSON_B_HANDLE, recordable: spouse.recordable, figures: null } : null }
  const check = checkDraftPerson(household, person, screen, field)
  if (!check.ok) return { ok: false, error: `${check.code}: ${check.reason}` }
  if (person !== 'B' || !link) return { ok: true, dataUserId: userId }
  return { ok: true, dataUserId: await link.dataUser(userId, taxYear, 'B') }
}
