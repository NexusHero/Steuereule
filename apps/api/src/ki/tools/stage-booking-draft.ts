import { randomUUID } from 'node:crypto'
import { ADVISOR_LEGAL_SOURCES, checkBookingDraft, parseBookingDraft, serializeBookingDraft, type AdvisorActionProposal } from '@steuereule/core'
import { checkPiiFree } from '../ki.adapter.js'
import { MAX_DRAFTS_PER_TURN, TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

const SOURCE = 'estg-4-3' as const

/**
 * The owl books as a draft (ADR-0101 §18, ADR-0066 Zero-Write): the entry is checked by the core against
 * the book of the case (chart, mode, Festschreibung, Kleinunternehmer) and becomes a pending draft on the
 * `buchung` mask. Nothing is posted here; the confirmation path posts it when the user takes it.
 */
export const stageBookingDraftTool = toolHandler(['stage_booking_draft'], async (_call, ctx) => {
  const { request, turn, answer, refuseDraft, consent } = ctx
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.stage_booking_draft)
  if (args === null) return
  const { label, reason, ...raw } = args
  const book = request.digest.business
  if (book === undefined) {
    const error = 'NO_BOOK: Für dieses Jahr gibt es kein Buch (keine Selbstständigkeit oder noch nicht freigeschaltet).'
    refuseDraft(label, 'buchung', error)
    answer({ ok: false, error })
    return
  }
  const parsed = parseBookingDraft(JSON.stringify(raw))
  if (!parsed.ok) {
    const error = `INVALID_BOOKING: ${parsed.reason}`
    refuseDraft(label, 'buchung', error)
    answer({ ok: false, error })
    return
  }
  const check = checkBookingDraft(parsed.draft, { chart: book.chart, mode: book.mode, year: request.digest.taxYear, lockedThrough: book.lockedThrough, smallBusiness: book.smallBusiness })
  if (!check.ok) {
    const error = `${check.code.toUpperCase()}: ${check.reason}`
    refuseDraft(label, 'buchung', error)
    answer({ ok: false, error })
    return
  }
  if (turn.pendingActions.length >= MAX_DRAFTS_PER_TURN) {
    const error = `TOO_MANY_DRAFTS: höchstens ${MAX_DRAFTS_PER_TURN} Entwürfe pro Antwort. Bitte den Nutzer erst diese prüfen lassen.`
    refuseDraft(label, 'buchung', error)
    answer({ ok: false, error })
    return
  }
  const newValue = serializeBookingDraft(parsed.draft)
  if (!consent) {
    try {
      checkPiiFree({ newValue, label, reason })
    } catch (error) {
      answer({ ok: false, error: error instanceof Error ? error.message : 'PII boundary rejected draft payload.' })
      return
    }
  }
  // Each draft is its own booking: its reference is the instance the confirmation path addresses.
  const instance = `entwurf-${randomUUID().slice(0, 12)}`
  const effect = await ctx.effectOf({ screen: 'buchung', instance, values: [['entry', newValue]] }, { beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 })
  turn.sources.push(SOURCE)
  const staged: AdvisorActionProposal = {
    actionId: ctx.makeActionId(),
    status: 'pending',
    screen: 'buchung',
    field: 'entry',
    instance,
    label,
    previousValue: null,
    expectedPreviousValue: null,
    newValue,
    ...effect,
    reason,
    sourceId: SOURCE,
    paragraph: ADVISOR_LEGAL_SOURCES[SOURCE].paragraph,
  }
  turn.pendingActions = [...turn.pendingActions, staged]
  answer({ ok: true, stagedAction: { ...staged, newValue: undefined, booking: parsed.draft }, draftsInThisAnswer: turn.pendingActions.length })
})
