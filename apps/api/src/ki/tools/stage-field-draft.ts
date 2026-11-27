import {
  ADVISOR_LEGAL_SOURCES,
  isNewRecordId,
  simulateAdvisorFieldDelta,
  checkDraftPerson,
  checkDraftRules,
  draftFollowUps,
  transportFollowUps,
  impliedCompanions,
  type AdvisorActionProposal,
  type AdvisorStreamEvent,
  type StoredTransport,
} from '@steuereule/core'
import { checkStageValue, normalizeSourceId, validateStageTarget, type StageTargetCheck } from '../advisor-safety.js'
import { checkPiiFree } from '../ki.adapter.js'
import { MAX_COMPANION_FIELDS, TOOL_ARG_SCHEMAS, MAX_DRAFTS_PER_TURN, draftKey } from '../advisor-tools.js'
import { draftValuesOf, toolHandler } from './tool-call-context.js'

export const stageFieldDraftTool = toolHandler(['stage_field_draft'], async (_call, ctx) => {
  const { request, consent, turn, answer, refuseDraft, rejectTarget } = ctx
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.stage_field_draft)
  if (args === null) return
  const { screen, field, label, reason } = args
  const sourceId = normalizeSourceId(args.sourceId)
  const rawCompanions = Object.entries(args.companionFields ?? {}).map(([k, v]) => [k.trim(), v] as const)

  const target = validateStageTarget(screen, field, consent)
  if (!target.ok) {
    refuseDraft(label, screen, target.error, undefined, target.consentRequired)
    rejectTarget(target)
    return
  }
  // Person B only where the household has one A records for, and only on B's own masks.
  const person = args.person
  const personCheck = checkDraftPerson(request.household, person, target.screen, field, label)
  if (!personCheck.ok) {
    const error = `${personCheck.code}: ${personCheck.reason}`
    refuseDraft(label, screen, error)
    answer({ ok: false, error })
    return
  }
  if (rawCompanions.length > MAX_COMPANION_FIELDS) {
    answer({ ok: false, error: `INVALID_ARGUMENTS: höchstens ${MAX_COMPANION_FIELDS} Begleitfelder.` })
    return
  }
  const record = ctx.resolveInstance(target.screen, field.trim(), args.instance)
  if (!record.ok) {
    const error = `${record.code}: ${record.reason}`
    // No record yet: the user creates it in the mask, and the chat offers the way there.
    // Which of several: that is a question for the user, not something to report as failed.
    if (record.code !== 'RECORD_REQUIRED') refuseDraft(label, screen, error, record.code === 'NO_RECORD' ? target.screen : undefined)
    if (record.code === 'NO_RECORD') {
      ctx.config?.writer?.({ event: 'ui_command', data: { openMask: target.screen, focus: field.trim() } } satisfies AdvisorStreamEvent)
    }
    answer({ ok: false, error })
    return
  }
  const instance = record.id
  if (turn.pendingActions.length >= MAX_DRAFTS_PER_TURN) {
    const error = `TOO_MANY_DRAFTS: höchstens ${MAX_DRAFTS_PER_TURN} Entwürfe pro Antwort. Bitte den Nutzer erst diese prüfen lassen.`
    refuseDraft(label, screen, error)
    answer({ ok: false, error })
    return
  }
  // Companion fields are written with the same rights as the main field, so they pass the same gate.
  const lockedCompanion = rawCompanions
    .map(([companionField]) => validateStageTarget(screen, companionField, consent))
    .find((check): check is Extract<StageTargetCheck, { ok: false }> => !check.ok)
  if (lockedCompanion) {
    refuseDraft(label, screen, lockedCompanion.error, undefined, lockedCompanion.consentRequired)
    rejectTarget(lockedCompanion)
    return
  }
  // Every value is checked against the field catalogue and stored in its tidied form: a
  // draft that could not be applied is refused here, with the reason, instead of being made.
  const checkedValues = [[field.trim(), args.newValue] as const, ...rawCompanions].map(([name, value]) => ({ name, check: checkStageValue(screen, name, value) }))
  const badValue = checkedValues.find((entry) => !entry.check.ok)
  if (badValue && !badValue.check.ok) {
    refuseDraft(label, screen, badValue.check.error)
    answer({ ok: false, error: badValue.check.error })
    return
  }
  const tidy = (name: string): string => {
    const entry = checkedValues.find((candidate) => candidate.name === name)!
    return entry.check.ok ? entry.check.value : ''
  }
  const cleanFieldName = field.trim()
  const newValue = tidy(cleanFieldName)
  const statedCompanions = rawCompanions.map(([name]) => [name, tidy(name)] as const)
  // The fixed rules (ADR-0093): what the app adds itself, and what it refuses until the user confirmed it.
  const implied = impliedCompanions(target.screen, Object.fromEntries([[cleanFieldName, newValue], ...statedCompanions]))
  const companionEntries = [...statedCompanions, ...Object.entries(implied).map(([name, value]) => [name, value] as const)]
  const companionFields = companionEntries.length > 0 ? Object.fromEntries(companionEntries) : undefined
  const draftValues = Object.fromEntries([[cleanFieldName, newValue], ...companionEntries])
  // The user's words of this turn and the model's reason: what a rule about an ambiguous statement reads.
  const rule = checkDraftRules({ screen: target.screen, values: draftValues, tool: 'stage', others: turn.pendingActions.map(draftValuesOf), said: `${request.message}\n${reason}`, userWords: [...(request.history ?? []).filter((entry) => entry.role === 'user').map((entry) => entry.content), request.message].join('\n') })
  if (!rule.ok) {
    // A question for the user, not a failed draft: the model asks and stages again.
    answer({ ok: false, error: `${rule.code}: ${rule.reason}` })
    return
  }

  // A new child is created from its draft: it needs the first name and the birth date (ADR-0091).
  // Further drafts of the same answer for that child (Kindergeld, Kita …) ride on the draft that creates it.
  if (target.screen === 'kind' && isNewRecordId(instance)) {
    const written = new Set([
      cleanFieldName,
      ...companionEntries.map(([name]) => name),
      ...turn.pendingActions.filter((existing) => existing.screen === 'kind' && existing.instance === instance).flatMap((existing) => [existing.field, ...Object.keys(existing.companionFields ?? {})]),
    ])
    if (!written.has('firstName') || !written.has('geburtsdatum')) {
      const error = 'NEW_RECORD_INCOMPLETE: Ein neues Kind lege ich mit Vorname (firstName) und Geburtsdatum (geburtsdatum) in einem Entwurf an, als Haupt- oder Begleitfeld; weitere Angaben zu diesem Kind folgen danach mit derselben `instance`. Frag den Nutzer nach Vorname und Geburtsdatum, wenn sie fehlen.'
      refuseDraft(label, screen, error)
      answer({ ok: false, error })
      return
    }
  }
  // With the consent to personal data the values may carry a Steuer-ID or an IBAN (ADR-0091).
  if (!consent) {
    try {
      checkPiiFree({ newValue, label, reason, companionFields: companionFields ?? {} })
    } catch (error) {
      answer({ ok: false, error: error instanceof Error ? error.message : 'PII boundary rejected draft payload.' })
      return
    }
  }

  const cleanField = field.trim()
  const forB = person === 'B'
  // The digest is the user's; Person B's previous value is read when the draft is stored.
  const sim = forB ? { previousValue: null, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 } : simulateAdvisorFieldDelta(request.digest, target.screen, cleanField, newValue)
  const effect = await ctx.effectOf({ screen: target.screen, instance, ...(forB ? { person } : {}), values: [...companionEntries, [cleanField, newValue]] }, sim)
  turn.sources.push(sourceId)

  const stagedAction: AdvisorActionProposal = {
    actionId: ctx.makeActionId(),
    status: 'pending',
    screen: target.screen,
    field: cleanField,
    instance,
    ...(forB ? { person } : {}),
    ...(companionFields ? { companionFields } : {}),
    label: record.handle && !label.includes(record.handle) ? `${label} (${record.handle})` : label,
    previousValue: sim.previousValue,
    expectedPreviousValue: sim.previousValue,
    newValue,
    ...effect,
    reason,
    sourceId,
    paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
  }

  // Several drafts in one answer stand side by side; a second one for the same field is a correction.
  turn.pendingActions = [...turn.pendingActions.filter((existing) => draftKey(existing) !== draftKey(stagedAction)), stagedAction]

  const mustAsk = [...draftFollowUps(target.screen, draftValues), ...commuteTransportAsks(target.screen, forB, turn.pendingActions, request.digest.commuteAndWorkdays.meansOfTransport)]
  answer({ ok: true, stagedAction: { ...stagedAction, instance: record.handle }, draftsInThisAnswer: turn.pendingActions.length, ...(mustAsk.length > 0 ? { mustAsk } : {}) })
})

/**
 * A drafted distance or travel days count only with the means of transport; the model hears it with
 * the tool's answer when neither the mask nor this answer holds it. All commute drafts of this answer
 * count, so a transport drafted before the kilometres silences it. Person B's mask is not in the digest.
 */
function commuteTransportAsks(screen: string, forB: boolean, pending: readonly AdvisorActionProposal[], stored: StoredTransport | undefined): string[] {
  if (screen !== 'commute' || forB) return []
  const drafted = Object.assign({}, ...pending.filter((action) => action.screen === 'commute' && action.person === undefined).map((action) => draftValuesOf(action).values)) as Record<string, string>
  return transportFollowUps(drafted, stored)
}
