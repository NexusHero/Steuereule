// The owl screen wired to the API: loads the session of the tax year and turns every action of
// the view into a request.
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useBreakpoint } from '@steuereule/ui'
import { PROFESSION_VALUES, type AdvisorChatMessageView, type OwlCardsDisplay, type Profession } from '@steuereule/core'
import {
  getAdvisorControllerGetSessionQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  useAdvisorControllerApplyAction,
  advisorControllerSearch,
  useAdvisorControllerClearConversation,
  useAdvisorControllerCreateNote,
  useAdvisorControllerDeleteNote,
  useAdvisorControllerUndoNoteChange,
  useAdvisorControllerUpdateNote,
  useAdvisorControllerCreateConversation,
  useAdvisorControllerDeleteConversation,
  useAdvisorControllerRenameConversation,
  useAdvisorControllerSummarizeConversation,
  useAdvisorControllerGetSession,
  useAdvisorControllerSendMessage,
  useAdvisorControllerSetFeedback,
  useAdvisorControllerUndoAction,
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useOwlModeControllerDismissCard,
  useOwlModeControllerGetCards,
  useOwlModeControllerGetSetting,
  useOwlModeControllerSetSetting,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { sendOptionsToDto } from './AdvisorChatPanel'
import { invalidateAllTaxQueries, useOptionalCopilotBridge } from './CopilotBridgeProvider'
import { OwlModeScreenView } from './OwlModeScreen'
import type { OwlModeScreenProps } from './OwlModeScreen'

/** The answer when the API said 200; otherwise it throws, so the caller's failure state shows. */
export function expectOk<R extends { readonly status: number }>(response: R, what: string): Extract<R, { readonly status: 200 }> {
  if (response.status !== 200) throw new Error(`${what} (HTTP ${response.status})`)
  return response as Extract<R, { readonly status: 200 }>
}

export function professionFrom(value: string | undefined): Profession | null {
  return (PROFESSION_VALUES as readonly string[]).includes(value ?? '') ? (value as Profession) : null
}

export function ConnectedOwlModeScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, onAcceptPath }: OwlModeScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const bridge = useOptionalCopilotBridge()
  const settingQuery = useOwlModeControllerGetSetting()
  const cardsQuery = useOwlModeControllerGetCards(taxYear)
  // Null = the conversation used last; the server decides which one that is (#481).
  const [localConversationId, setLocalConversationId] = useState<string | null>(null)
  const conversationId = bridge ? bridge.conversationId : localConversationId
  const selectConversation = (id: string | null) => (bridge ? bridge.setConversationId(id) : setLocalConversationId(id))
  const sessionQuery = useAdvisorControllerGetSession(taxYear, conversationId ? { conversationId } : undefined, { query: { retry: false } })
  const searchConversations = useCallback(
    async (query: string) => {
      const response = expectOk(await advisorControllerSearch(taxYear, { q: query }), 'search failed')
      return response.data
    },
    [taxYear],
  )
  const createConversationMutation = useAdvisorControllerCreateConversation()
  const renameConversationMutation = useAdvisorControllerRenameConversation()
  const deleteConversationMutation = useAdvisorControllerDeleteConversation()
  const summarizeConversationMutation = useAdvisorControllerSummarizeConversation()
  const createNoteMutation = useAdvisorControllerCreateNote()
  const updateNoteMutation = useAdvisorControllerUpdateNote()
  const deleteNoteMutation = useAdvisorControllerDeleteNote()
  const undoNoteChangeMutation = useAdvisorControllerUndoNoteChange()
  const sendMessageMutation = useAdvisorControllerSendMessage()
  const applyActionMutation = useAdvisorControllerApplyAction()
  const setFeedbackMutation = useAdvisorControllerSetFeedback()
  const clearConversationMutation = useAdvisorControllerClearConversation()
  const undoActionMutation = useAdvisorControllerUndoAction()
  const setSetting = useOwlModeControllerSetSetting()
  const dismissCard = useOwlModeControllerDismissCard()
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  const postAnswer = useInterviewControllerPostAnswer()
  const interviewAnswers = interviewQuery.data?.status === 200 ? (interviewQuery.data.data.answers as Record<string, string>) : undefined

  if (settingQuery.isPending || cardsQuery.isPending) {
    return <LoadingState bp={bp} label={tr('eule.loading', 'Eulen-Modus wird geladen …')} />
  }
  if (settingQuery.isError || cardsQuery.isError || settingQuery.data.status !== 200 || cardsQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('eule.loadError.heading', 'Das hat nicht geklappt.')}
        message={tr('eule.loadError.message', 'Der Eulen-Modus konnte nicht geladen werden.')}
        retryLabel={tr('eule.loadError.retry', 'Noch mal versuchen')}
        onRetry={() => {
          void settingQuery.refetch()
          void cardsQuery.refetch()
          void sessionQuery.refetch()
        }}
      />
    )
  }

  const invalidate = async () => {
    if (bridge) {
      await invalidateAllTaxQueries(queryClient, taxYear)
      return
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
    ])
  }

  const cards: readonly OwlCardsDisplay[] = cardsQuery.data.data.cards.map((k) => ({
    ...k,
    amountEur: k.amountEur ?? null,
    ...(k.paths && k.paths.length === 2 ? { paths: [k.paths[0]!, k.paths[1]!] as const } : { paths: undefined }),
  }))

  const session = sessionQuery.data?.status === 200 ? sessionQuery.data.data : undefined
  const serverMessages = session ? (session.messages as unknown as readonly AdvisorChatMessageView[]) : undefined

  return (
    <OwlModeScreenView
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      taxYear={taxYear}
      initialCards={cards}
      initialMessages={serverMessages}
      optInEnabled={settingQuery.data.data.enabled}
      onToggleOptIn={async (enabled) => {
        await setSetting.mutateAsync({ data: { enabled } })
        await invalidate()
      }}
      onDismissCard={async (fingerprint) => {
        await dismissCard.mutateAsync({ jahr: taxYear, fingerprint })
        await invalidate()
      }}
      {...(onAcceptPath ? { onAcceptPath } : {})}
      profession={interviewAnswers === undefined ? undefined : professionFrom(interviewAnswers['beruf'])}
      onChooseProfession={async (profession) => {
        expectOk(await postAnswer.mutateAsync({ jahr: taxYear, data: { questionId: 'beruf', value: profession } }), 'profession not stored')
        await invalidate()
      }}
      onRateMessage={async (messageId, rating, reason) => {
        const response = await setFeedbackMutation.mutateAsync({
          jahr: taxYear,
          messageId,
          data: { rating, ...(reason !== undefined ? { reason } : {}) },
        })
        if (response.status !== 200) throw new Error(`rating not stored (HTTP ${response.status})`)
        await queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
      }}
      context={session?.context}
      onSummarize={async () => {
        if (!session) return
        expectOk(await summarizeConversationMutation.mutateAsync({ jahr: taxYear, conversationId: session.conversationId }), 'conversation not summarised')
        await invalidate()
      }}
      notes={session?.notes}
      onAddNote={async (text) => {
        expectOk(await createNoteMutation.mutateAsync({ jahr: taxYear, data: { text } }), 'note not stored')
        await invalidate()
      }}
      onEditNote={async (id, text) => {
        expectOk(await updateNoteMutation.mutateAsync({ jahr: taxYear, noteId: id, data: { text } }), 'note not changed')
        await invalidate()
      }}
      onDeleteNote={async (id) => {
        expectOk(await deleteNoteMutation.mutateAsync({ jahr: taxYear, noteId: id }), 'note not deleted')
        await invalidate()
      }}
      onUndoNoteChange={async (messageId, index) => {
        expectOk(await undoNoteChangeMutation.mutateAsync({ jahr: taxYear, messageId, index }), 'note change not undone')
        await invalidate()
      }}
      conversations={session?.conversations}
      onSearchConversations={searchConversations}
      activeConversationId={session?.conversationId ?? null}
      onSelectConversation={(id) => selectConversation(id)}
      onNewConversation={async () => {
        const response = expectOk(await createConversationMutation.mutateAsync({ jahr: taxYear }), 'conversation not created')
        selectConversation(response.data.id)
        await invalidate()
      }}
      onRenameConversation={async (id, title) => {
        expectOk(await renameConversationMutation.mutateAsync({ jahr: taxYear, conversationId: id, data: { title } }), 'conversation not renamed')
        await invalidate()
      }}
      onDeleteConversation={async (id) => {
        expectOk(await deleteConversationMutation.mutateAsync({ jahr: taxYear, conversationId: id }), 'conversation not deleted')
        // The open one is gone: back to whichever was used last.
        if (id === session?.conversationId) selectConversation(null)
        await invalidate()
      }}
      onClearConversation={async () => {
        expectOk(await clearConversationMutation.mutateAsync({ jahr: taxYear, ...(session ? { params: { conversationId: session.conversationId } } : {}) }), 'conversation not cleared')
        await invalidate()
      }}
      onSendMessage={async (text, options) => {
        if (bridge) {
          const activeScreen = bridge.owlViewMode.kind === 'mask' ? bridge.owlViewMode.screen : undefined
          await bridge.sendStreamingMessage(text, activeScreen, options)
          return
        }
        await sendMessageMutation.mutateAsync({ jahr: taxYear, data: { message: text, ...sendOptionsToDto(options) } })
        await invalidate()
      }}
      onApplyAction={async (actionId) => {
        if (bridge) {
          await bridge.applySingleAction(actionId)
          return
        }
        await applyActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
      onUndoAction={async (actionId) => {
        if (bridge) {
          await bridge.undoSingleAction(actionId)
          return
        }
        await undoActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
    />
  )
}
