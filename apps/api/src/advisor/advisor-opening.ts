import {
  advisorOpeningStage,
  caseFingerprint,
  openingFigures,
  openingGaps,
  type AdvisorEnginePort,
  type AdvisorMessageMeta,
  type AdvisorOpeningBrief,
  type AdvisorOpeningStage,
  type AdvisorStreamEvent,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type CaseDigest,
  type OpeningEstimate,
} from '@steuereule/core'
import type { TaxEstimateStatus } from '../tax-estimate/tax-estimate.service.js'
import type { AdvisorRepository } from './advisor.repository.js'
import type { AdvisorOpeningStateDto } from './dto/advisor.dto.js'

/** What the user message of an opening says; it is hidden in the chat and only marks the turn. */
export const OPENING_PLACEHOLDER = 'Neues Gespräch: Bitte eröffne mit deiner Einschätzung meiner Lage.'

export type OpeningMarker = NonNullable<AdvisorMessageMeta['opening']>

export interface OpeningContext {
  readonly digest: CaseDigest
  readonly stage: AdvisorOpeningStage
  readonly fingerprint: string
}

/**
 * The owl opens a new conversation itself (ADR-0067 §11). The stage and every figure come from
 * the app before any model is asked; the model only puts them into words.
 */
export class AdvisorOpening {
  constructor(
    private readonly advisorRepo: AdvisorRepository,
    private readonly buildDigest: (userId: string, taxYear: number) => Promise<CaseDigest>,
    private readonly situationOf: (userId: string) => Promise<string>,
    private readonly estimateOf: ((userId: string, taxYear: number) => Promise<TaxEstimateStatus>) | undefined,
  ) {}

  async context(userId: string, taxYear: number): Promise<OpeningContext> {
    const [digest, situation, notes] = await Promise.all([this.buildDigest(userId, taxYear), this.situationOf(userId), this.advisorRepo.listNotes(userId, taxYear)])
    return { digest, stage: advisorOpeningStage(digest), fingerprint: caseFingerprint(digest, situation, notes.map((note) => note.text)) }
  }

  /** The newest finished opening of the year, if any. */
  private async lastOpening(userId: string, taxYear: number): Promise<{ conversationId: string; createdAt: Date; marker: OpeningMarker } | null> {
    const messages = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    let last: { conversationId: string; createdAt: Date; marker: OpeningMarker } | null = null
    for (const message of messages) {
      const marker = message.meta?.opening
      if (message.role !== 'assistant' || message.status !== 'complete' || !marker || message.meta?.replaced || !message.conversationId) continue
      if (last === null || message.createdAt > last.createdAt) last = { conversationId: message.conversationId, createdAt: message.createdAt, marker }
    }
    return last
  }

  async state(userId: string, taxYear: number): Promise<AdvisorOpeningStateDto> {
    const [{ stage, fingerprint }, last] = await Promise.all([this.context(userId, taxYear), this.lastOpening(userId, taxYear)])
    return {
      stage,
      shouldOpen: stage !== 'empty' && last?.marker.fingerprint !== fingerprint,
      lastOpening: last ? { conversationId: last.conversationId, createdAt: last.createdAt.toISOString() } : null,
    }
  }

  /** The figures and gaps the engine gets; the estimate is the app's own, where it can make one. */
  async brief(userId: string, taxYear: number, context: OpeningContext): Promise<AdvisorOpeningBrief> {
    const stage = context.stage === 'ready' ? 'ready' : 'partial'
    let estimate: OpeningEstimate | null = null
    const status = this.estimateOf ? await this.estimateOf(userId, taxYear).catch(() => null) : null
    if (status?.kind === 'spanne') {
      estimate = { resultFromEur: status.result.from, resultToEur: status.result.to, incomeRelatedExpensesEur: status.werbungskosten }
    }
    return { stage, gaps: openingGaps(context.digest), figures: openingFigures(context.digest, estimate) }
  }
}

/** The amounts the answer check found unbacked, from its notices. */
function unbackedAmountsOf(result: AdvisorTurnResult): number[] {
  return (result.meta.notices ?? []).flatMap((notice) => (notice.kind === 'unbacked-amount' ? [...(notice.amounts ?? [])] : []))
}

/**
 * Runs the opening and holds its text back until it passed the answer check: an opening that
 * names an amount the app did not work out is written once more, with those amounts named as
 * wrong (the user's second guardrail). Steps and reasoning stream as usual. Drafts never leave an
 * opening; they come from the user's answer.
 */
export async function* openingStream(engine: AdvisorEnginePort, request: AdvisorTurnRequest, brief: AdvisorOpeningBrief): AsyncIterable<AdvisorStreamEvent> {
  let attemptBrief = brief
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let done: AdvisorTurnResult | null = null
    let held = ''
    for await (const event of engine.streamTurn({ ...request, task: 'opening', opening: attemptBrief, planRequired: false })) {
      if (event.event === 'token') {
        held += event.data.text
        continue
      }
      if (event.event === 'action' || event.event === 'twoPaths') continue
      if (event.event === 'done') {
        done = event.data as AdvisorTurnResult
        break
      }
      yield event
      if (event.event === 'error') return
    }
    if (done === null) {
      // Stopped or cut off: what was written so far is kept, as with any answer.
      if (held.length > 0) yield { event: 'token', data: { text: held } }
      return
    }
    const unbacked = unbackedAmountsOf(done)
    if (unbacked.length > 0 && attempt === 0) {
      attemptBrief = { ...brief, unbackedAmounts: unbacked }
      yield { event: 'status', data: { text: 'Die Eule prüft ihre Zahlen noch einmal …' } }
      continue
    }
    const { action: _action, actions: _actions, twoPaths: _twoPaths, ...meta } = done.meta
    yield { event: 'token', data: { text: done.replyText } }
    yield { event: 'done', data: { ...done, meta } }
    return
  }
}
