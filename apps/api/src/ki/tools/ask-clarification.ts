import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const askClarificationTool = toolHandler(['ask_clarification'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.ask_clarification)
  if (args === null) return
  ctx.turn.choices = args.choices.map((c) => c.trim()).filter((c) => c.length > 0)
  ctx.answer({ ok: true, choices: ctx.turn.choices })
})
