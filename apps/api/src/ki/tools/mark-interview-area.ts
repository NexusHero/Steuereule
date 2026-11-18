import { isInterviewAreaId } from '@steuereule/core'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const markInterviewAreaTool = toolHandler(['mark_interview_area'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.mark_interview_area)
  if (args === null) return
  if (!isInterviewAreaId(args.area)) return
  ctx.turn.interviewChanges = [...ctx.turn.interviewChanges.filter((change) => change.area !== args.area), { area: args.area, status: args.status }]
  ctx.answer({ ok: true, area: args.area, status: args.status })
})
