import { checkSmallBusiness, computeGiftTax, estimateTradeTax } from '@steuereule/core'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

/** Gift tax, the small-business rule and the trade tax: deterministic checks that throw on inputs they cannot read. */
export const deterministicChecksTool = toolHandler(['compute_gift_tax', 'check_small_business', 'estimate_trade_tax'], (call, ctx) => {
  try {
    if (call.name === 'compute_gift_tax') {
      const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.compute_gift_tax)
      if (args !== null) ctx.answer({ ok: true, ...computeGiftTax(args) })
    } else if (call.name === 'check_small_business') {
      const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.check_small_business)
      if (args !== null) ctx.answer({ ok: true, ...checkSmallBusiness(args) })
    } else {
      const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.estimate_trade_tax)
      if (args !== null) ctx.answer({ ok: true, ...estimateTradeTax(args) })
    }
  } catch (error) {
    ctx.answer({ ok: false, error: error instanceof Error ? error.message : 'Ungültige Angaben.' })
  }
})
