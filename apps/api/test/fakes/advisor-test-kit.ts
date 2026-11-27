import type { AdvisorEnginePort, AdvisorStreamEvent, AdvisorTurnRequest, AdvisorTurnResult } from '@steuereule/core'
import { AdvisorService } from '../../src/advisor/advisor.service.js'
import { InMemoryAdvisorRepository } from '../../src/advisor/advisor.repository.js'
import { AuditService } from '../../src/audit/audit.service.js'
import { ConfirmationService } from '../../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../../src/confirmation/field-access.js'
import { RagKiAdapter } from '../../src/ki/ki.adapter.js'
import { LinkService } from '../../src/link/link.service.js'
import { OwlModeService } from '../../src/owl-mode/owl-mode.service.js'
import { FakeAssessmentRepository } from './fake-assessment.repository.js'
import { FakeAuditRepository } from './fake-audit.repository.js'
import { FakeCapitalRepository } from './fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fake-child.repository.js'
import { FakeCommuteRepository } from './fake-commute.repository.js'
import { FakeInterviewAnswerRepository } from './fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fake-link.repository.js'
import { FakeLstbRepository } from './fake-lstb.repository.js'
import { FakeMarkingRepository } from './fake-marking.repository.js'
import { FakeMasterDataRepository } from './fake-master-data.repository.js'
import { FakeOwlCardDismissalRepository, FakeOwlSettingRepository } from './fake-owl-mode.repository.js'
import { FakePensionRepository } from './fake-pension.repository.js'
import { FakeProfileRepository } from './fake-profile.repository.js'
import { FakeRentalRepository } from './fake-rental.repository.js'
import { FakePersonalDataConsentRepository } from './fake-personal-data-consent.repository.js'
import { PersonalDataConsentService } from '../../src/owl-mode/personal-data-consent.service.js'
import { TaxEstimateService } from '../../src/tax-estimate/tax-estimate.service.js'
import { ChildrenService } from '../../src/children/children.service.js'
import { AssessmentService } from '../../src/assessment/assessment.service.js'
import { composeBusinessService } from '../../src/business/business.composition.js'
import { HebesatzDirectory } from '../../src/business/hebesatz.js'
import { passThroughTransactionRunner, type TransactionRunner } from '../../src/common/transaction-runner.js'
import { EnvAiRuntimeConfigService, type AiRuntimeConfigService } from '../../src/ki/ai-runtime-config.service.js'
import { ModelConnectionService } from '../../src/ki/model-connection.service.js'
import { AdvisorCaseDigest, type PrintoutGaps } from '../../src/advisor/advisor-case-digest.js'
import { AdvisorCaseFacts } from '../../src/advisor/advisor-case-facts.js'
import { draftRecordRegistry } from '../../src/advisor/advisor-draft-records.js'
import { ChildDraftRecords } from '../../src/children/child-draft-records.js'
import { RentalDraftRecords } from '../../src/rental/rental-draft-records.js'
import { AdvisorDrafts } from '../../src/advisor/advisor-drafts.js'
import { AdvisorTurn } from '../../src/advisor/advisor-turn.js'
import { InMemoryAdvisorRunLog, type AdvisorRunLog } from '../../src/advisor/run/advisor-run-log.js'
import { AdvisorRunService } from '../../src/advisor/run/advisor-run.service.js'
import type { Provider, Type } from '@nestjs/common'
import { AdvisorDocumentStaging } from '../../src/advisor/advisor-document-staging.js'
import { AdvisorConversations } from '../../src/advisor/advisor-conversations.js'
import { AdvisorOpening } from '../../src/advisor/advisor-opening.js'
import { AdvisorProjectNotes } from '../../src/advisor/advisor-project-notes.js'
import { NotFoundError } from '../../src/common/domain-error.js'
import { FakeBusinessRepository } from './fake-business.repository.js'
import { FakeReceiptRepository } from './fake-receipt.repository.js'
import { taxCaseReaderOver } from '../../src/tax-case/repository-tax-case.reader.js'

/** The fakes and the services over them that every wiring of the advisor shares. */
export interface AdvisorTestFakes {
  readonly advisorRepo: InMemoryAdvisorRepository
  readonly interviewRepo: FakeInterviewAnswerRepository
  readonly rentalRepo: FakeRentalRepository
  readonly capitalRepo: FakeCapitalRepository
  readonly childRepo: FakeChildRepository
  readonly commuteRepo: FakeCommuteRepository
  readonly chRepo: FakeChSalaryCertificateRepository
  readonly lstbRepo: FakeLstbRepository
  readonly pensionRepo: FakePensionRepository
  readonly receiptRepo: FakeReceiptRepository
  readonly markingRepo: FakeMarkingRepository
  readonly auditRepo: FakeAuditRepository
  readonly linkRepo: FakeLinkRepository
  /** The Bescheid the drafts of a read Steuerbescheid are applied to (ADR-0098). */
  readonly assessmentRepo: FakeAssessmentRepository
  /** The joint return: set it up with `set` and `updatePersonB` to give the user a Person B. */
  readonly linkService: LinkService
  readonly profileRepo: FakeProfileRepository
  /** The consent to personal data for the owl (ADR-0091); none until a test gives it. */
  readonly consent: PersonalDataConsentService
  readonly masterDataRepo: FakeMasterDataRepository
  readonly auditService: AuditService
  readonly confirmationService: ConfirmationService
  readonly owlModeService: OwlModeService
  /** The estimate over the same fakes, as the owl reads it. */
  readonly taxEstimate: TaxEstimateService
  /** The Kinder mask's own service over the same fakes, for comparing the mask against the chat. */
  readonly children: ChildrenService
}

/** What a test may replace in a wiring; everything else is the kit's fake or the real service over the fakes. */
export interface AdvisorTestKitOptions {
  /** The language model. Without one the fixed rules answer. */
  readonly engine?: AdvisorEnginePort | undefined
  readonly modelConnection?: ModelConnectionService | undefined
  readonly transactions?: TransactionRunner | undefined
  /** The printout check; the kit's default knows no forms for any year, so the digest carries no printout gaps. */
  readonly printout?: PrintoutGaps | undefined
  readonly runtimeConfig?: AiRuntimeConfigService | undefined
}

/** The parts of the advisor, each as the app provides it. */
export interface AdvisorParts {
  /** The session, clearing a conversation, feedback, the opening state and the connection. */
  readonly session: AdvisorService
  readonly drafts: AdvisorDrafts
  readonly caseDigest: AdvisorCaseDigest
  readonly conversations: AdvisorConversations
  readonly notes: AdvisorProjectNotes
  readonly opening: AdvisorOpening
  readonly turn: AdvisorTurn
  /** What the document readers inject. */
  readonly staging: AdvisorDocumentStaging
}

/**
 * Every operation of the advisor under one name, for tests that exercise a flow across parts. The
 * app has no such object: there each consumer injects the part it uses.
 */
export type AdvisorTestFacade = Pick<AdvisorService, 'getSession' | 'setFeedback' | 'clearConversation' | 'connection' | 'openingState'> &
  Pick<AdvisorTurn, 'sendMessage' | 'prepareTurn' | 'streamMessage' | 'executeTurn'> &
  Pick<AdvisorConversations, 'conversationFor' | 'listConversations' | 'createConversation' | 'renameConversation' | 'markRead' | 'deleteConversation' | 'summarizeConversation' | 'searchConversations'> & {
    readonly setConversationModel: AdvisorConversations['setChatModel']
  } & Pick<AdvisorProjectNotes, 'saveSituation' | 'listNotes' | 'createNote' | 'updateNote' | 'deleteNote' | 'undoNoteChange'> &
  Pick<AdvisorCaseDigest, 'knownNamesForScrubbing' | 'advisorHousehold' | 'loadRecordHandles' | 'buildCaseDigest' | 'previewEffectFor' | 'estimateReaderFor'> &
  Pick<AdvisorDrafts, 'applyAction' | 'applyBatch' | 'undoAction' | 'dismissAction'> &
  Pick<
    AdvisorDocumentStaging,
    | 'stageBookingProposal'
    | 'stageReceiptProposal'
    | 'stageLstbScanBatch'
    | 'householdNames'
    | 'householdMembers'
    | 'stageDocumentDrafts'
    | 'countedReceiptItems'
    | 'childForReceipt'
    | 'takeBackDocumentValues'
    | 'markLstbActionsApplied'
    | 'receiptDrafts'
  >

/** The named methods of a part, bound to it. */
function bound<T extends object, K extends keyof T>(target: T, ...keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, (target[key] as (...args: unknown[]) => unknown).bind(target)])) as Pick<T, K>
}

function facadeOf(parts: AdvisorParts): AdvisorTestFacade {
  return {
    ...bound(parts.session, 'getSession', 'setFeedback', 'clearConversation', 'connection', 'openingState'),
    ...bound(parts.turn, 'sendMessage', 'prepareTurn', 'streamMessage', 'executeTurn'),
    ...bound(parts.conversations, 'conversationFor', 'listConversations', 'createConversation', 'renameConversation', 'markRead', 'deleteConversation', 'summarizeConversation', 'searchConversations'),
    setConversationModel: parts.conversations.setChatModel.bind(parts.conversations),
    ...bound(parts.notes, 'saveSituation', 'listNotes', 'createNote', 'updateNote', 'deleteNote', 'undoNoteChange'),
    ...bound(parts.caseDigest, 'knownNamesForScrubbing', 'advisorHousehold', 'loadRecordHandles', 'buildCaseDigest', 'previewEffectFor', 'estimateReaderFor'),
    ...bound(parts.drafts, 'applyAction', 'applyBatch', 'undoAction', 'dismissAction'),
    ...bound(
      parts.staging,
      'stageBookingProposal',
      'stageReceiptProposal',
      'stageLstbScanBatch',
      'householdNames',
      'householdMembers',
      'stageDocumentDrafts',
      'countedReceiptItems',
      'childForReceipt',
      'takeBackDocumentValues',
      'markLstbActionsApplied',
      'receiptDrafts',
    ),
  }
}

/** The same facade over the parts of a running Nest app, for tests that boot the real modules. */
export function advisorOf(app: { get<T>(token: Type<T>): T }): AdvisorTestFacade {
  return facadeOf({
    session: app.get(AdvisorService),
    drafts: app.get(AdvisorDrafts),
    caseDigest: app.get(AdvisorCaseDigest),
    conversations: app.get(AdvisorConversations),
    notes: app.get(AdvisorProjectNotes),
    opening: app.get(AdvisorOpening),
    staging: app.get(AdvisorDocumentStaging),
    turn: app.get(AdvisorTurn),
  })
}

/** The advisor wired over the kit's fakes. */
export interface AdvisorWiring extends AdvisorParts {
  readonly service: AdvisorTestFacade
  /** What AdvisorController injects from the advisor, for a Nest testing module. */
  readonly providers: readonly Provider[]
  /** The run service over this wiring; its log stays in memory unless a test brings one. */
  runService(log?: AdvisorRunLog): AdvisorRunService
}

export interface AdvisorTestKit extends AdvisorTestFakes, AdvisorWiring {
  /** The advisor once more over the same fakes, with other collaborators: another engine, a recording transaction runner. */
  rewire(overrides: AdvisorTestKitOptions): AdvisorWiring
}

/** A year without forms: the printout has nothing to check, as for a tax year the app has no templates for. */
const noFormsPrintout: PrintoutGaps = {
  check: async () => {
    throw new NotFoundError('VORDRUCKE_MISSING', 'No Vordrucke are available for this tax year yet.')
  },
}

/** The advisor on in-memory fakes, wired completely; pass an engine to exercise the model path. */
export function buildAdvisorTestKit(engine?: AdvisorEnginePort, modelConnection?: ModelConnectionService, options: AdvisorTestKitOptions = {}): AdvisorTestKit {
  const advisorRepo = new InMemoryAdvisorRepository()
  const interviewRepo = new FakeInterviewAnswerRepository()
  const lstbRepo = new FakeLstbRepository()
  const chRepo = new FakeChSalaryCertificateRepository()
  const childRepo = new FakeChildRepository()
  const rentalRepo = new FakeRentalRepository()
  const capitalRepo = new FakeCapitalRepository()
  const profileRepo = new FakeProfileRepository()
  const commuteRepo = new FakeCommuteRepository()
  const assessmentRepo = new FakeAssessmentRepository()
  const receiptRepo = new FakeReceiptRepository()
  const markingRepo = new FakeMarkingRepository()
  const auditRepo = new FakeAuditRepository()
  const auditService = new AuditService(auditRepo)
  const linkRepo = new FakeLinkRepository()
  const masterDataRepo = new FakeMasterDataRepository()
  const pensionRepo = new FakePensionRepository()
  const linkService = new LinkService(linkRepo, profileRepo, masterDataRepo, auditService)
  const access = fieldAccessFrom({
    lstb: lstbRepo,
    pension: pensionRepo,
    capital: capitalRepo,
    rental: rentalRepo,
    profile: profileRepo,
    masterData: masterDataRepo,
    link: linkRepo,
    interview: interviewRepo,
    chSalaryCertificate: chRepo,
    child: childRepo,
    commute: commuteRepo,
    assessment: assessmentRepo,
    linkFilingType: async (userId, taxYear, filingType) => {
      await linkService.set(userId, taxYear, { filingType })
    },
  })
  const consent = new PersonalDataConsentService(new FakePersonalDataConsentRepository(), auditService)
  const confirmationService = new ConfirmationService(markingRepo, access, auditService)
  const owlModeService = new OwlModeService(
    new FakeOwlSettingRepository(),
    new FakeOwlCardDismissalRepository(),
    childRepo,
    interviewRepo,
    assessmentRepo,
    new RagKiAdapter(),
    auditService,
  )
  const taxEstimate = new TaxEstimateService(taxCaseReaderOver({ wageTaxCertificate: lstbRepo, interview: interviewRepo, salaryStatement: chRepo, masterData: masterDataRepo, commute: commuteRepo, coupling: linkRepo, children: childRepo, rental: rentalRepo, pension: pensionRepo }))
  const children = new ChildrenService(childRepo, auditService, chRepo, linkRepo)
  const assessmentService = new AssessmentService(assessmentRepo, taxCaseReaderOver({ wageTaxCertificate: lstbRepo, interview: interviewRepo, salaryStatement: chRepo }), auditService)
  const business = composeBusinessService(new FakeBusinessRepository(), interviewRepo, auditService, new HebesatzDirectory())
  const defaultRuntimeConfig = new EnvAiRuntimeConfigService({})

  const wire = (wiring: AdvisorTestKitOptions): AdvisorWiring => {
    const runtimeConfig = wiring.runtimeConfig ?? defaultRuntimeConfig
    const transactions = wiring.transactions ?? passThroughTransactionRunner
    const facts = new AdvisorCaseFacts(capitalRepo, chRepo, childRepo, commuteRepo, confirmationService, interviewRepo, lstbRepo, owlModeService, profileRepo, rentalRepo, pensionRepo)
    const drafts = new AdvisorDrafts(advisorRepo, auditService, confirmationService, transactions, linkService, consent, draftRecordRegistry([new ChildDraftRecords(childRepo), new RentalDraftRecords(rentalRepo)]))
    const caseDigest = new AdvisorCaseDigest(advisorRepo, confirmationService, facts, drafts, transactions, consent, linkService, wiring.printout ?? noFormsPrintout, receiptRepo, taxEstimate, business)
    const advisorEngine = wiring.engine ?? null
    const conversations = new AdvisorConversations(advisorEngine, advisorRepo, auditService, caseDigest)
    const notes = new AdvisorProjectNotes(advisorRepo, caseDigest, auditService)
    const opening = new AdvisorOpening(advisorRepo, caseDigest, notes, taxEstimate)
    const staging = new AdvisorDocumentStaging(advisorRepo, owlModeService, confirmationService, auditService, transactions, caseDigest, drafts, profileRepo, linkService, childRepo)
    const connection = wiring.modelConnection ?? new ModelConnectionService(runtimeConfig)
    const turn = new AdvisorTurn(advisorRepo, owlModeService, caseDigest, conversations, notes, opening, drafts, transactions, consent, advisorEngine, runtimeConfig, connection, assessmentService, linkService, profileRepo, childRepo)
    const session = new AdvisorService(advisorRepo, owlModeService, auditService, caseDigest, conversations, notes, opening, advisorEngine, connection)
    const parts: AdvisorParts = { session, drafts, caseDigest, conversations, notes, opening, staging, turn }
    const providers = [
      { provide: AdvisorService, useValue: session },
      { provide: AdvisorTurn, useValue: turn },
      { provide: AdvisorConversations, useValue: conversations },
      { provide: AdvisorProjectNotes, useValue: notes },
      { provide: AdvisorDrafts, useValue: drafts },
    ]
    const runService = (log: AdvisorRunLog = new InMemoryAdvisorRunLog()) => new AdvisorRunService(session, turn, conversations, log, advisorRepo)
    return { ...parts, service: facadeOf(parts), providers, runService }
  }

  const base: AdvisorTestKitOptions = { ...options, engine: options.engine ?? engine, modelConnection: options.modelConnection ?? modelConnection }
  return {
    advisorRepo,
    interviewRepo,
    rentalRepo,
    capitalRepo,
    childRepo,
    commuteRepo,
    chRepo,
    lstbRepo,
    pensionRepo,
    receiptRepo,
    markingRepo,
    auditRepo,
    linkRepo,
    assessmentRepo,
    linkService,
    profileRepo,
    consent,
    masterDataRepo,
    auditService,
    confirmationService,
    owlModeService,
    taxEstimate,
    children,
    ...wire(base),
    rewire: (overrides) => wire({ ...base, ...overrides }),
  }
}

/** A step of a scripted engine turn: an event, or a pause that only ends when the turn is aborted. */
export type ScriptStep =
  | AdvisorStreamEvent
  | { readonly waitForAbort: true }
  | { readonly fail: Error }
  /** Holds the turn until the test releases it. */
  | { readonly waitFor: Promise<void> }

export function doneEvent(result: Partial<AdvisorTurnResult> & { replyText: string }): AdvisorStreamEvent {
  return { event: 'done', data: { meta: {}, mode: 'langgraph', provider: 'fake', model: 'fake-1', ...result } satisfies AdvisorTurnResult }
}

/** Plays a fixed script and records every request it was given. */
export class ScriptedAdvisorEngine implements AdvisorEnginePort {
  readonly requests: AdvisorTurnRequest[] = []

  constructor(private readonly script: readonly ScriptStep[]) {}

  async *streamTurn(request: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent> {
    this.requests.push(request)
    for (const step of this.script) {
      if ('fail' in step) throw step.fail
      if ('waitFor' in step) {
        await step.waitFor
        continue
      }
      if ('waitForAbort' in step) {
        await new Promise<void>((resolve) => {
          if (request.signal?.aborted) resolve()
          else request.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
        // Like the real engine: a client abort ends the turn without a final event.
        return
      }
      yield step
    }
  }

  async runTurn(): Promise<AdvisorTurnResult> {
    throw new Error('not used')
  }
}

export async function collect(stream: AsyncIterable<AdvisorStreamEvent>): Promise<AdvisorStreamEvent[]> {
  const events: AdvisorStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}
