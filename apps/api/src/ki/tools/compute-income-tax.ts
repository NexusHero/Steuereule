import { isChurchTaxFactor } from '@steuereule/core'
import { computeIncomeTax } from '../advisor-income-tax.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const computeIncomeTaxTool = toolHandler(['compute_income_tax'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.compute_income_tax)
  if (args === null) return
  if (!isChurchTaxFactor(args.churchTaxRate)) {
    ctx.answer({ ok: false, error: 'Der Kirchensteuersatz ist 0, 0.08 (Bayern, Baden-Württemberg) oder 0.09.' })
    return
  }
  const result = computeIncomeTax({ ...args, churchTaxRate: args.churchTaxRate })
  ctx.answer(result === null ? { ok: false, error: `Für das Jahr ${args.year} kennt der Rechenkern keinen Tarif.` } : { ok: true, ...result })
})
