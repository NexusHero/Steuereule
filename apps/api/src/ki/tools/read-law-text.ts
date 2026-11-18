import { readLawForOwl, type LawId } from '../law-text.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const readLawTextTool = toolHandler(['read_law_text'], async (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.read_law_text)
  if (args === null) return
  try {
    ctx.answer({ ok: true, ...(await readLawForOwl(args.law as LawId, args.paragraph, args)) })
  } catch {
    ctx.answer({ ok: false, error: 'gesetze-im-internet.de ist gerade nicht erreichbar. Stütze dich auf das nachgeschlagene Wissen und den Quellenkatalog und sage dazu, dass der Wortlaut nicht frisch gelesen wurde.' })
  }
})
