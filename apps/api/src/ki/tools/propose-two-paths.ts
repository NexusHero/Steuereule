import { ADVISOR_LEGAL_SOURCES, simulateAdvisorFieldDelta, checkDraftPerson, checkDraftRules } from '@steuereule/core'
import { checkStageValue, normalizeSourceId, validateStageTarget } from '../advisor-safety.js'
import { checkPiiFree } from '../ki.adapter.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { draftValuesOf, toolHandler } from './tool-call-context.js'

export const proposeTwoPathsTool = toolHandler(['propose_two_paths'], async (_call, ctx) => {
  const { request, consent, turn, answer, rejectTarget } = ctx
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.propose_two_paths)
  if (args === null) return
  const title = args.title
  const sourceId = normalizeSourceId(args.sourceId)
  const rawSafe = args.safePath
  const rawMax = args.maxPath

  const safeCheck = validateStageTarget(rawSafe.screen, rawSafe.field, consent)
  if (!safeCheck.ok) {
    rejectTarget(safeCheck)
    return
  }
  const maxCheck = validateStageTarget(rawMax.screen, rawMax.field, consent)
  if (!maxCheck.ok) {
    rejectTarget(maxCheck)
    return
  }
  const safePersonCheck = checkDraftPerson(request.household, rawSafe.person, safeCheck.screen, rawSafe.field, rawSafe.label)
  const maxPersonCheck = checkDraftPerson(request.household, rawMax.person, maxCheck.screen, rawMax.field, rawMax.label)
  const personRefusal = !safePersonCheck.ok ? safePersonCheck : !maxPersonCheck.ok ? maxPersonCheck : null
  if (personRefusal) {
    answer({ ok: false, error: `${personRefusal.code}: ${personRefusal.reason}` })
    return
  }
  const safeForB = rawSafe.person === 'B'
  const maxForB = rawMax.person === 'B'

  const safeField = rawSafe.field.trim()
  const maxField = rawMax.field.trim()
  const safeValue = checkStageValue(safeCheck.screen, safeField, rawSafe.newValue)
  const maxValue = checkStageValue(maxCheck.screen, maxField, rawMax.newValue)
  if (!safeValue.ok || !maxValue.ok) {
    answer({ ok: false, error: !safeValue.ok ? safeValue.error : !maxValue.ok ? maxValue.error : '' })
    return
  }
  const safeNewValue = safeValue.value
  const maxNewValue = maxValue.value
  const others = turn.pendingActions.map(draftValuesOf)
  const pathRule = [
    checkDraftRules({ screen: safeCheck.screen, values: { [safeField]: safeNewValue }, tool: 'two-paths', others }),
    checkDraftRules({ screen: maxCheck.screen, values: { [maxField]: maxNewValue }, tool: 'two-paths', others }),
  ].find((check) => !check.ok)
  if (pathRule && !pathRule.ok) {
    answer({ ok: false, error: `${pathRule.code}: ${pathRule.reason}` })
    return
  }

  // Two paths name no record: fine while there is exactly one, a question for the user otherwise.
  const safeRecord = ctx.resolveInstance(safeCheck.screen, safeField, rawSafe.instance)
  const maxRecord = ctx.resolveInstance(maxCheck.screen, maxField, rawMax.instance)
  const missingRecord = !safeRecord.ok ? safeRecord : !maxRecord.ok ? maxRecord : null
  if (!safeRecord.ok || !maxRecord.ok || missingRecord) {
    answer({ ok: false, error: missingRecord ? `${missingRecord.code}: ${missingRecord.reason}` : '' })
    return
  }
  try {
    if (!consent) checkPiiFree({ safeNewValue, maxNewValue, title, safeLabel: rawSafe.label, maxLabel: rawMax.label })
  } catch (error) {
    answer({ ok: false, error: error instanceof Error ? error.message : 'PII boundary rejected twoPaths payload.' })
    return
  }

  const unknownForB = { previousValue: null, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 }
  const safeSim = safeForB ? unknownForB : simulateAdvisorFieldDelta(request.digest, safeCheck.screen, safeField, safeNewValue)
  const maxSim = maxForB ? unknownForB : simulateAdvisorFieldDelta(request.digest, maxCheck.screen, maxField, maxNewValue)
  const safeEffect = await ctx.effectOf({ screen: safeCheck.screen, instance: safeRecord.id, ...(safeForB ? { person: 'B' as const } : {}), values: [[safeField, safeNewValue]] }, safeSim)
  const maxEffect = await ctx.effectOf({ screen: maxCheck.screen, instance: maxRecord.id, ...(maxForB ? { person: 'B' as const } : {}), values: [[maxField, maxNewValue]] }, maxSim)
  const baseActionId = ctx.makeActionId()
  turn.sources.push(sourceId)

  turn.pendingTwoPaths = {
    title,
    sourceId,
    safePath: {
      actionId: `${baseActionId}-safe`,
      alternativeGroup: baseActionId,
      status: 'pending',
      screen: safeCheck.screen,
      field: safeField,
      instance: safeRecord.id,
      ...(safeForB ? { person: 'B' as const } : {}),
      label: rawSafe.label,
      previousValue: safeSim.previousValue,
      expectedPreviousValue: safeSim.previousValue,
      newValue: safeNewValue,
      ...safeEffect,
      reason: rawSafe.reason,
      sourceId,
      paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
    },
    maxPath: {
      actionId: `${baseActionId}-max`,
      alternativeGroup: baseActionId,
      status: 'pending',
      screen: maxCheck.screen,
      field: maxField,
      instance: maxRecord.id,
      ...(maxForB ? { person: 'B' as const } : {}),
      label: rawMax.label,
      previousValue: maxSim.previousValue,
      expectedPreviousValue: maxSim.previousValue,
      newValue: maxNewValue,
      ...maxEffect,
      reason: rawMax.reason,
      evidenceHint: rawMax.evidenceHint,
      sourceId,
      paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
    },
  }

  answer({ ok: true, twoPaths: turn.pendingTwoPaths })
})
