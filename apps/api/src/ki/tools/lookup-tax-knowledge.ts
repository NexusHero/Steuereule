import { ADVISOR_KNOWLEDGE } from '../skills.generated.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const lookupTaxKnowledgeTool = toolHandler(['lookup_tax_knowledge'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.lookup_tax_knowledge)
  if (args === null) return
  const entry = ADVISOR_KNOWLEDGE[args.topic]
  ctx.answer({ ok: true, topic: args.topic, title: entry.title, text: entry.text })
})
