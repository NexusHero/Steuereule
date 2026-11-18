import { ADVISOR_LEGAL_SOURCES } from '@steuereule/core'
import { normalizeSourceId } from '../advisor-safety.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const lookupLegalSourceTool = toolHandler(['lookup_legal_source'], (_call, ctx) => {
  const lookupArgs = ctx.parseArgs(TOOL_ARG_SCHEMAS.lookup_legal_source)
  if (lookupArgs === null) return
  const sourceId = normalizeSourceId(lookupArgs.sourceId)
  ctx.turn.sources.push(sourceId)
  ctx.answer({ ok: true, source: ADVISOR_LEGAL_SOURCES[sourceId] })
})
