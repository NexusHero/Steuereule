import { checkPrivateSale, privateSalesExemptionLimit, privateSalesWithinLimit } from '@steuereule/core'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const checkHoldingPeriodTool = toolHandler(['check_holding_period'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.check_holding_period)
  if (args === null) return
  try {
    const result = checkPrivateSale(args)
    const year = Number(args.soldOn.slice(0, 4))
    const limit =
      args.totalGainsOfYearEur === undefined
        ? {}
        : { exemptionLimitEur: privateSalesExemptionLimit(year), withinExemptionLimit: privateSalesWithinLimit(args.totalGainsOfYearEur, year) }
    ctx.answer({ ok: true, ...result, ...limit })
  } catch (error) {
    ctx.answer({ ok: false, error: error instanceof Error ? error.message : 'Ungültige Angaben.' })
  }
})
