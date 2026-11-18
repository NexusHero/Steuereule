import { toolHandler } from './tool-call-context.js'

export const readCurrentEstimateTool = toolHandler(['read_current_estimate'], async (_call, ctx) => {
  if (!ctx.request.readEstimate) {
    ctx.answer({ ok: false, error: 'ESTIMATE_UNAVAILABLE: Die Schätzung der App ist hier nicht verfügbar. Nenne keinen Gesamtbetrag.' })
    return
  }
  try {
    ctx.answer({ ok: true, estimate: await ctx.request.readEstimate() })
  } catch {
    ctx.answer({ ok: false, error: 'ESTIMATE_UNAVAILABLE: Die Schätzung lässt sich gerade nicht lesen. Nenne keinen Gesamtbetrag.' })
  }
})
