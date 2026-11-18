import { type AdvisorActionProposal } from '@steuereule/core'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const withdrawDraftTool = toolHandler(['withdraw_draft'], (_call, ctx) => {
  const { turn } = ctx
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.withdraw_draft)
  if (args === null) return
  const field = args.field.trim()
  const forB = args.person === 'B'
  const sameTarget = (action: Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance' | 'person'>): boolean => {
    if (action.screen !== args.screen || action.field !== field || (action.person === 'B') !== forB) return false
    if (args.instance === undefined || args.instance === null) return true
    const record = ctx.resolveInstance(action.screen, field, args.instance)
    return record.ok && record.id === action.instance
  }
  const before = turn.pendingActions.length
  turn.pendingActions = turn.pendingActions.filter((action) => !sameTarget(action))
  const withdrawnPaths = turn.pendingTwoPaths !== null && (sameTarget(turn.pendingTwoPaths.safePath) || sameTarget(turn.pendingTwoPaths.maxPath))
  if (withdrawnPaths) turn.pendingTwoPaths = null
  const withdrawn = before - turn.pendingActions.length + (withdrawnPaths ? 1 : 0)
  ctx.answer(withdrawn > 0 ? { ok: true, withdrawn, draftsInThisAnswer: turn.pendingActions.length } : { ok: false, error: 'NO_SUCH_DRAFT: In dieser Antwort gibt es keinen solchen Entwurf.' })
})
