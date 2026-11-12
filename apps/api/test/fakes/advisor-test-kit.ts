import type { AdvisorEnginePort, AdvisorStreamEvent, AdvisorTurnRequest, AdvisorTurnResult } from '@steuereule/core'
import { AdvisorService } from '../../src/advisor/advisor.service.js'
import { InMemoryAdvisorRepository } from '../../src/advisor/advisor.repository.js'
import { AuditService } from '../../src/audit/audit.service.js'
import { ConfirmationService } from '../../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../../src/confirmation/field-access.js'
import { RagKiAdapter } from '../../src/ki/ki.adapter.js'
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

export interface AdvisorTestKit {
  readonly advisorRepo: InMemoryAdvisorRepository
  readonly interviewRepo: FakeInterviewAnswerRepository
  readonly rentalRepo: FakeRentalRepository
  readonly childRepo: FakeChildRepository
  readonly service: AdvisorService
}

/** An AdvisorService on in-memory fakes; pass an engine to exercise the model path. */
export function buildAdvisorTestKit(engine?: AdvisorEnginePort): AdvisorTestKit {
  const advisorRepo = new InMemoryAdvisorRepository()
  const interviewRepo = new FakeInterviewAnswerRepository()
  const lstbRepo = new FakeLstbRepository()
  const chRepo = new FakeChSalaryCertificateRepository()
  const childRepo = new FakeChildRepository()
  const rentalRepo = new FakeRentalRepository()
  const profileRepo = new FakeProfileRepository()
  const commuteRepo = new FakeCommuteRepository()
  const assessmentRepo = new FakeAssessmentRepository()
  const auditService = new AuditService(new FakeAuditRepository())
  const access = fieldAccessFrom({
    lstb: lstbRepo,
    pension: new FakePensionRepository(),
    capital: new FakeCapitalRepository(),
    rental: rentalRepo,
    profile: profileRepo,
    masterData: new FakeMasterDataRepository(),
    link: new FakeLinkRepository(),
    interview: interviewRepo,
    chSalaryCertificate: chRepo,
    child: childRepo,
    commute: commuteRepo,
    assessment: assessmentRepo,
  })
  const confirmationService = new ConfirmationService(new FakeMarkingRepository(), access, auditService)
  const owlModeService = new OwlModeService(
    new FakeOwlSettingRepository(),
    new FakeOwlCardDismissalRepository(),
    childRepo,
    interviewRepo,
    assessmentRepo,
    new RagKiAdapter(),
    auditService,
  )
  const service = new AdvisorService(
    advisorRepo,
    owlModeService,
    confirmationService,
    auditService,
    interviewRepo,
    lstbRepo,
    chRepo,
    commuteRepo,
    childRepo,
    rentalRepo,
    new FakeCapitalRepository(),
    profileRepo,
    engine,
  )
  return { advisorRepo, interviewRepo, rentalRepo, childRepo, service }
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
