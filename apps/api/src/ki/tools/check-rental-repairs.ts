import { checkRentalRepairs } from '@steuereule/core'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const checkRentalRepairsTool = toolHandler(['check_rental_repairs'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.check_rental_repairs)
  if (args === null) return
  try {
    ctx.answer({ ok: true, ...checkRentalRepairs(args) })
  } catch (error) {
    ctx.answer({ ok: false, error: error instanceof Error ? error.message : 'Ungültige Angaben.' })
  }
})
