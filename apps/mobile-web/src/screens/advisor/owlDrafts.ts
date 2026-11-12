// Drafts as the owl screen reads them out of the conversation and marks them after a click.
import { type AdvisorActionProposal, type AdvisorChatMessageView } from '@steuereule/core'

export function extractPendingDrafts(messages: readonly AdvisorChatMessageView[]): readonly AdvisorActionProposal[] {
  const seen = new Set<string>()
  const drafts: AdvisorActionProposal[] = []
  for (const msg of messages) {
    const candidates: AdvisorActionProposal[] = []
    if (msg.meta?.action) candidates.push(msg.meta.action)
    // Several drafts in one answer (ADR-0066). A scanned certificate keeps its own review flow.
    if (msg.meta?.actions && !msg.meta.lstbScan) candidates.push(...msg.meta.actions)
    if (msg.meta?.twoPaths) {
      candidates.push(msg.meta.twoPaths.safePath, msg.meta.twoPaths.maxPath)
    }
    for (const candidate of candidates) {
      if (candidate.status === 'pending' && !seen.has(candidate.actionId)) {
        seen.add(candidate.actionId)
        drafts.push(candidate)
      }
    }
  }
  return drafts
}

export function updateActionStatusInMessage(
  msg: AdvisorChatMessageView,
  actionId: string,
  status: AdvisorActionProposal['status'],
): AdvisorChatMessageView {
  if (!msg.meta) return msg
  if (msg.meta.action?.actionId === actionId) {
    return {
      ...msg,
      meta: { ...msg.meta, action: { ...msg.meta.action, status } },
    }
  }
  if (msg.meta.actions?.some((a) => a.actionId === actionId)) {
    return {
      ...msg,
      meta: { ...msg.meta, actions: msg.meta.actions.map((a) => (a.actionId === actionId ? { ...a, status } : a)) },
    }
  }
  if (msg.meta.twoPaths) {
    if (msg.meta.twoPaths.safePath.actionId === actionId) {
      return {
        ...msg,
        meta: {
          ...msg.meta,
          twoPaths: {
            ...msg.meta.twoPaths,
            safePath: { ...msg.meta.twoPaths.safePath, status },
          },
        },
      }
    }
    if (msg.meta.twoPaths.maxPath.actionId === actionId) {
      return {
        ...msg,
        meta: {
          ...msg.meta,
          twoPaths: {
            ...msg.meta.twoPaths,
            maxPath: { ...msg.meta.twoPaths.maxPath, status },
          },
        },
      }
    }
  }
  return msg
}
