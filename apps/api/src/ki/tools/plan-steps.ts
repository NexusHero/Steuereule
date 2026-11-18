import { type AdvisorStreamEvent } from '@steuereule/core'
import { checkPiiFree } from '../ki.adapter.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const planStepsTool = toolHandler(['plan_steps'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.plan_steps)
  if (args === null) return
  const steps = args.steps.map((step) => ({ text: step.text.trim(), status: step.status }))
  try {
    checkPiiFree({ steps })
  } catch (error) {
    ctx.answer({ ok: false, error: error instanceof Error ? error.message : 'PII boundary rejected plan.' })
    return
  }
  ctx.config?.writer?.({ event: 'plan', data: { steps } } satisfies AdvisorStreamEvent)
  ctx.answer({ ok: true, shown: steps.length })
})
