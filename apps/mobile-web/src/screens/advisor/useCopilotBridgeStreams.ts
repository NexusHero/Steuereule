import { useCallback } from 'react'
import type { Screen } from '@steuereule/core'
import { useAnswerRuns } from './useAnswerRuns'
import { useOpenConversation } from './useOpenConversation'

export interface UseCopilotBridgeStreamsInput {
  readonly taxYear: number
  readonly isAuthenticated: boolean
  readonly onSwitchYear: ((year: number) => void) | undefined
  readonly openMaskPreview: (screen: Screen, field?: string) => void
}

/** The answers of every conversation: which one is open, what is streamed, stopped or failed, and following runs. */
export function useCopilotBridgeStreams({ taxYear, isAuthenticated, onSwitchYear, openMaskPreview }: UseCopilotBridgeStreamsInput) {
  const { open, setConversationId, adoptDefaultConversationId, openConversationInYear } = useOpenConversation({ taxYear, onSwitchYear })
  const { moveAnswersFromPending, ...answers } = useAnswerRuns({ taxYear, isAuthenticated, openMaskPreview, open })
  /** The screen learned which conversation the server opened: what was asked before it knew moves there. */
  const adoptConversationId = useCallback(
    (id: string) => {
      if (adoptDefaultConversationId(id)) moveAnswersFromPending(id)
    },
    [adoptDefaultConversationId, moveAnswersFromPending],
  )
  return { ...answers, conversationId: open.conversationId, setConversationId, adoptConversationId, openConversationInYear }
}
