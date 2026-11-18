import { isChurchTaxFactor } from '@steuereule/core'
import { checkCapitalTaxation, compareFilingTypes } from '../advisor-income-tax.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

/** Joint against separate filing, and the flat capital tax against the personal rate: two comparisons over the tariff. */
export const compareTaxPathsTool = toolHandler(['compare_filing_types', 'check_capital_taxation'], (call, ctx) => {
  const raw = call.name === 'compare_filing_types' ? ctx.parseArgs(TOOL_ARG_SCHEMAS.compare_filing_types) : ctx.parseArgs(TOOL_ARG_SCHEMAS.check_capital_taxation)
  if (raw === null) return
  if (!isChurchTaxFactor(raw.churchTaxRate)) {
    ctx.answer({ ok: false, error: 'Der Kirchensteuersatz ist 0, 0.08 (Bayern, Baden-Württemberg) oder 0.09.' })
    return
  }
  const result = 'taxableIncomeA' in raw ? compareFilingTypes({ ...raw, churchTaxRate: raw.churchTaxRate }) : checkCapitalTaxation({ ...raw, churchTaxRate: raw.churchTaxRate })
  ctx.answer(result === null ? { ok: false, error: `Für das Jahr ${raw.year} kennt der Rechenkern keinen Tarif.` } : { ok: true, ...result })
})
