import { simulateAdvisorFieldDelta } from '@steuereule/core'
import { checkStageValue, validateStageTarget } from '../advisor-safety.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const simulateTaxDeltaTool = toolHandler(['simulate_tax_delta'], async (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.simulate_tax_delta)
  if (args === null) return
  const { screen, field, newValue } = args
  const target = validateStageTarget(screen, field, ctx.consent)
  if (!target.ok) {
    ctx.rejectTarget(target)
    return
  }
  const simValue = checkStageValue(target.screen, field, newValue)
  if (!simValue.ok) {
    ctx.answer({ ok: false, error: simValue.error })
    return
  }
  const sim = simulateAdvisorFieldDelta(ctx.request.digest, target.screen, field.trim(), simValue.value)
  const simRecord = ctx.resolveInstance(target.screen, field.trim(), null)
  const simEffect = simRecord.ok
    ? await ctx.effectOf({ screen: target.screen, instance: simRecord.id, values: [[field.trim(), simValue.value]] }, sim)
    : ({ beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: simRecord.reason } as const)
  ctx.answer({ ok: true, previousValue: sim.previousValue, ...simEffect })
})
