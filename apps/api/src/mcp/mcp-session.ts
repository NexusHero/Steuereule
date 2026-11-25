import type { Provenance } from '@steuereule/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkDraftPerson, PERSON_B_HANDLE, type AdvisorHousehold, type Screen } from '@steuereule/core'
import type { AssistantTaskService } from '../assistant-task/assistant-task.service.js'
import type { AuditService } from '../audit/audit.service.js'
import type { BusinessService } from '../business/business.service.js'
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
import type { KeyedLock } from '../common/keyed-lock.js'
import type { TransactionRunner } from '../common/transaction-runner.js'
import type { UploadAdmission } from '../receipt/upload-admission.js'
import type { YearHistoryRepository } from '../year-history/year-history.repository.js'
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

/** The injection token of `McpDeps`: one object gathered by `mcpDepsProvider`, so `McpService` takes it whole. */
export const MCP_DEPS = Symbol('MCP_DEPS')

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
  /** Caps counted and filled under one lock per account and year (MCP-23, H2-20). */
  readonly locks: KeyedLock
  /** Check and delete of an own record in one transaction (H2-28). */
  readonly transactions: TransactionRunner
  /** The upload admission of the REST route: a few uploads at once per instance, one per account. */
  readonly admission?: Pick<UploadAdmission, 'acquire'> | undefined
  readonly report?: McpReportService | undefined
  /** The joint return (ADR-0054): whose data a value for Person B goes to. */
  readonly link?: Pick<LinkService, 'spouseForAdvisor' | 'dataUser'> | undefined
  /** A child is a record of its own: the mask `kind` needs its id as `instance`. */
  readonly children?: Pick<ChildrenService, 'list' | 'create' | 'delete'> | undefined
  readonly deadlines?: Pick<DeadlinesService, 'getDeadlines'> | undefined
  /** A rental object is a record of its own: the mask `vermietung` needs its id as `instance`. */
  readonly rentals?: Pick<RentalRepository, 'listForUserAndYear' | 'create' | 'delete'> | undefined
  /** What only the user can do in the app, left as a task (#547). */
  readonly tasks?: Pick<AssistantTaskService, 'create' | 'listForAssistant' | 'withdrawOwn'> | undefined
  /** The book of the self-employed (ADR-0101): what a booking draft is checked against (#549). */
  readonly business?: Pick<BusinessService, 'digest' | 'bookingTarget'> | undefined
  /** The years the account holds anything for (`steuerjahre_auflisten`, MCP-10). */
  readonly years?: Pick<YearHistoryRepository, 'yearsOf'> | undefined
}

/**
 * Whether a receipt id names one of the caller's own receipts (H2-22): a Herkunft „aus Beleg X“ is only
 * kept for a receipt the account holds, never for a made-up or another account's id.
 */
export async function isOwnReceipt(deps: Pick<McpDeps, 'receipts'>, userId: string, receiptId: string | undefined): Promise<boolean> {
  return receiptId === undefined || (await deps.receipts.isOwnedBy(userId, receiptId))
}

/** The Herkunft an entry of this assistant carries. */
export function provenanceOf(assistant: AssistantSessionInfo, receiptId?: string): Extract<Provenance, { kind: 'assistent' }> {
  return { kind: 'assistent', name: assistant.clientName, clientId: assistant.clientId, ...(receiptId === undefined ? {} : { receiptId }) }
}

/**
 * Whether an entry is this assistant's own: by the client id of the connection, never by its name alone,
 * which every client chooses for itself. Entries from before the id was kept match by name.
 */
export function isOwnProvenance(provenance: Provenance | undefined, assistant: Pick<AssistantSessionInfo, 'clientId' | 'clientName'>): boolean {
  if (provenance?.kind !== 'assistent') return false
  return provenance.clientId === undefined ? provenance.name === assistant.clientName : provenance.clientId === assistant.clientId
}

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
