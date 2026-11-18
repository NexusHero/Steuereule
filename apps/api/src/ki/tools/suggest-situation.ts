import { checkPiiFree } from '../ki.adapter.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const suggestSituationTool = toolHandler(['suggest_situation'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.suggest_situation)
  if (args === null) return
  const text = args.text.replace(/\s+/g, ' ').trim()
  try {
    // A suggestion is shown to the user and may be stored: it must not carry a name or an identifier.
    checkPiiFree({ text })
  } catch {
    ctx.answer({ ok: false, error: 'Der Vorschlag enthält persönliche Daten. Formuliere ihn ohne Namen und Kennungen.' })
    return
  }
  const { situationSuggestions } = ctx.turn
  if (situationSuggestions.length < 3 && !situationSuggestions.includes(text)) situationSuggestions.push(text)
  ctx.answer({ ok: true, suggested: text })
})
