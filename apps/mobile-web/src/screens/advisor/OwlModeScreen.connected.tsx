// The owl screen wired to the API: loads the session of the tax year and turns every action of
// the view into a request.
import type { AdvisorConnection } from '@steuereule/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { OwlVoiceContext, useOwlVoiceOfDeployment } from '../../lib/readAloud/useOwlVoice'
import { useBreakpoint } from '@steuereule/ui'
import { PROFESSION_VALUES, type AdvisorChatMessageView, type OwlCardsDisplay, type Profession } from '@steuereule/core'
import {
  getAdvisorControllerGetSessionQueryKey,
  getAdvisorControllerListConversationsQueryKey,
  useAdvisorControllerMarkConversationRead,
  getInterviewControllerGetInterviewQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  useAdvisorControllerApplyAction,
  advisorControllerSearch,
  useAdvisorControllerClearConversation,
  useAdvisorControllerCreateNote,
  useAdvisorControllerDeleteNote,
  useAdvisorControllerUndoNoteChange,
  useAdvisorControllerSaveSituation,
  useAdvisorControllerUpdateNote,
  useAdvisorControllerConnection,
  useAdvisorControllerOpening,
  getAdvisorControllerOpeningQueryKey,
  useAdvisorControllerCreateConversation,
  useAdvisorControllerDeleteConversation,
  useAdvisorControllerRenameConversation,
  useAdvisorControllerListModels,
  useAdvisorControllerSetConversationModel,
  useAdvisorControllerSummarizeConversation,
  useAdvisorControllerGetSession,
  useAdvisorControllerSendMessage,
  useAdvisorControllerSetFeedback,
  useAdvisorControllerUndoAction,
  useAdvisorControllerDismissAction,
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useOwlModeControllerDismissCard,
  useOwlModeControllerGetCards,
  useOwlModeControllerGetSetting,
  useOwlModeControllerSetSetting,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { useDraftOwners } from './useDraftOwners'
import { runningTaxYear } from '../../config/taxYear'
import { LoadFailedState, LoadingState } from '../shared/ScreenState'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { apiErrorStatus } from '@steuereule/api-client'
import { sendOptionsToDto } from './AdvisorChatPanel'

/** What the client sends to open a conversation; the server replaces it with its own placeholder. */
const OPENING_MESSAGE = 'Eröffnung'
import { invalidateAllTaxQueries, useOptionalCopilotBridge } from './CopilotBridgeProvider'
import { useOwlVisible } from './owlUnread'
import { OwlModeScreenView } from './OwlModeScreen'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { ConnectionView } from './chat/ConnectionStatus'

export function professionFrom(value: string | undefined): Profession | null {
  return (PROFESSION_VALUES as readonly string[]).includes(value ?? '') ? (value as Profession) : null
}

export function ConnectedOwlModeScreen({ onDone = () => {}, onBack, taxYear = runningTaxYear(), onAcceptPath }: OwlModeScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const owlVoice = useOwlVoiceOfDeployment()
  const bridge = useOptionalCopilotBridge()
  const settingQuery = useOwlModeControllerGetSetting()
  const cardsQuery = useOwlModeControllerGetCards(taxYear)
  // Null = the conversation used last; the server decides which one that is (#481).
  const [localConversationId, setLocalConversationId] = useState<string | null>(null)
  const conversationId = bridge ? bridge.conversationId : localConversationId
  const selectConversation = (id: string | null) => (bridge ? bridge.setConversationId(id) : setLocalConversationId(id))
  const sessionQuery = useAdvisorControllerGetSession(taxYear, conversationId ? { conversationId } : undefined, { query: { retry: false } })
  // The conversation on screen is read: what the owl answered there no longer waits, here or on another
  // device. Only while the owl is in view; its screen stays mounted behind the other tabs.
  const owlVisible = useOwlVisible()
  const markRead = useAdvisorControllerMarkConversationRead()
  const markReadMutate = markRead.mutate
  const openSessionData = sessionQuery.data?.data
  const unreadOpenId = openSessionData?.conversations?.find((c) => c.id === openSessionData.conversationId)?.unread === true ? openSessionData.conversationId : null
  useEffect(() => {
    if (!owlVisible || unreadOpenId === null) return
    markReadMutate(
      { jahr: taxYear, conversationId: unreadOpenId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
          void queryClient.invalidateQueries({ queryKey: getAdvisorControllerListConversationsQueryKey(taxYear) })
        },
      },
    )
  }, [owlVisible, unreadOpenId, taxYear, markReadMutate, queryClient])
  const { partnerName, ownName, jointReturn } = useDraftOwners(
    taxYear,
    sessionQuery.data?.data.messages as unknown as readonly AdvisorChatMessageView[] | undefined,
  )
  // The server decided which conversation is open: the bridge files this conversation's answer under its id.
  const adoptConversationId = bridge?.adoptConversationId
  const openConversationId = sessionQuery.data?.data.conversationId
  useEffect(() => {
    if (adoptConversationId && openConversationId !== undefined) adoptConversationId(openConversationId)
  }, [adoptConversationId, openConversationId])
  const searchConversations = useCallback(
    async (query: string) => {
      const response = await advisorControllerSearch(taxYear, { q: query })
      return response.data
    },
    [taxYear],
  )
  // A new, empty conversation: the owl opens it herself when the case changed since her last opening (ADR-0067 §11).
  const openSession = sessionQuery.data?.data
  const openIsEmpty = openSession !== undefined && openSession.messages.length === 0 && !(bridge?.streaming ?? false)
  // Asked per conversation: each new one is opened (or not) by the state of the case at that moment.
  const openingQuery = useAdvisorControllerOpening(taxYear, {
    query: { queryKey: [...getAdvisorControllerOpeningQueryKey(taxYear), openSession?.conversationId ?? null], retry: false, enabled: openIsEmpty, staleTime: 0 },
  })
  const openingState = openingQuery.data?.data
  const openedConversationsRef = useRef(new Set<string>())
  const sendStreaming = bridge?.sendStreamingMessage
  const openConversationIdForOpening = openSession?.conversationId
  useEffect(() => {
    if (!sendStreaming || !openIsEmpty || openingState?.shouldOpen !== true || openConversationIdForOpening === undefined) return
    // One attempt per conversation: a failed opening must not be retried on every render.
    if (openedConversationsRef.current.has(openConversationIdForOpening)) return
    openedConversationsRef.current.add(openConversationIdForOpening)
    void sendStreaming(OPENING_MESSAGE, undefined, { quickAction: 'opening' })
  }, [sendStreaming, openIsEmpty, openingState?.shouldOpen, openConversationIdForOpening])
  // Whether the owl reaches its model, asked again every minute while the screen is open (#488).
  const connectionQuery = useAdvisorControllerConnection(taxYear, { query: { retry: false, refetchInterval: 60_000, refetchOnWindowFocus: true } })
  const connectionView: ConnectionView = connectionQuery.isError
    ? { kind: 'offline' }
    : connectionQuery.isSuccess
      ? { kind: 'model', connection: connectionQuery.data.data as AdvisorConnection }
      : { kind: 'checking' }
  const createConversationMutation = useAdvisorControllerCreateConversation()
  const renameConversationMutation = useAdvisorControllerRenameConversation()
  // ADR-0096: the models the user may pick, with their measured cost; the pick belongs to the conversation.
  const modelsQuery = useAdvisorControllerListModels(taxYear, { query: { retry: false, staleTime: 5 * 60 * 1000 } })
  const setConversationModelMutation = useAdvisorControllerSetConversationModel()
  const deleteConversationMutation = useAdvisorControllerDeleteConversation()
  const summarizeConversationMutation = useAdvisorControllerSummarizeConversation()
  const createNoteMutation = useAdvisorControllerCreateNote()
  const updateNoteMutation = useAdvisorControllerUpdateNote()
  const deleteNoteMutation = useAdvisorControllerDeleteNote()
  const undoNoteChangeMutation = useAdvisorControllerUndoNoteChange()
  const saveSituationMutation = useAdvisorControllerSaveSituation()
  const sendMessageMutation = useAdvisorControllerSendMessage()
  const applyActionMutation = useAdvisorControllerApplyAction()
  const setFeedbackMutation = useAdvisorControllerSetFeedback()
  const clearConversationMutation = useAdvisorControllerClearConversation()
  const undoActionMutation = useAdvisorControllerUndoAction()
  const dismissActionMutation = useAdvisorControllerDismissAction()
  const setSetting = useOwlModeControllerSetSetting()
  const dismissCard = useOwlModeControllerDismissCard()
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  const postAnswer = useInterviewControllerPostAnswer()
  const interviewAnswers = interviewQuery.data?.data.answers as Record<string, string> | undefined
  // NR-05: actions that used to fail silently (opt-in, hiding a card, model pick, new conversation, dismissing
  // a draft) put their failure here, shown above the screen in the shared wording.
  const [actionError, setActionError] = useState<unknown>(null)
  const reported =
    <A extends unknown[]>(work: (...args: A) => Promise<void>, { rethrow = false } = {}) =>
    async (...args: A): Promise<void> => {
      setActionError(null)
      try {
        await work(...args)
      } catch (error) {
        setActionError(error)
        if (rethrow) throw error
      }
    }

  if (settingQuery.isPending || cardsQuery.isPending) {
    return <LoadingState bp={bp} label={tr('eule.loading', 'Eulen-Modus wird geladen …')} />
  }
  const loadError = settingQuery.error ?? cardsQuery.error ?? sessionQuery.error
  // WEB-48 / NR-03: a conversation that did not load is a failure with a retry — never an empty chat whose
  // missing list and notes look like a deleted history.
  if (settingQuery.isError || cardsQuery.isError || sessionQuery.isError) {
    return (
      <LoadFailedState
        bp={bp}
        error={loadError}
        onRetry={() => {
          // A conversation that is gone (deleted elsewhere): back to the one used last.
          if (sessionQuery.isError && conversationId !== null && apiErrorStatus(sessionQuery.error) === 404) selectConversation(null)
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

  const session = sessionQuery.data?.data
  const serverMessages = session ? (session.messages as unknown as readonly AdvisorChatMessageView[]) : undefined

  return (
    <OwlVoiceContext.Provider value={owlVoice}>
    <SaveFailedNotice visible={actionError !== null} error={actionError} />
    <OwlModeScreenView
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      taxYear={taxYear}
      initialCards={cards}
      initialMessages={serverMessages}
      partnerName={partnerName}
      ownName={ownName}
      jointReturn={jointReturn}
      optInEnabled={settingQuery.data.data.enabled}
      onToggleOptIn={reported(async (enabled: boolean) => {
        await setSetting.mutateAsync({ data: { enabled } })
        await invalidate()
      })}
      onDismissCard={reported(
        async (fingerprint: string) => {
          await dismissCard.mutateAsync({ jahr: taxYear, fingerprint })
          await invalidate()
        },
        { rethrow: true },
      )}
      {...(onAcceptPath ? { onAcceptPath } : {})}
      profession={interviewAnswers === undefined ? undefined : professionFrom(interviewAnswers['beruf'])}
      onChooseProfession={async (profession) => {
        await postAnswer.mutateAsync({ jahr: taxYear, data: { questionId: 'beruf', value: profession } })
        await invalidate()
      }}
      onRateMessage={async (messageId, rating, reason) => {
        await setFeedbackMutation.mutateAsync({
          jahr: taxYear,
          messageId,
          data: { rating, ...(reason !== undefined ? { reason } : {}) },
        })
        await queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
      }}
      context={session?.context}
      onSummarize={async () => {
        if (!session) return
        await summarizeConversationMutation.mutateAsync({ jahr: taxYear, conversationId: session.conversationId })
        await invalidate()
      }}
      notes={session?.notes}
      onAddNote={async (text) => {
        await createNoteMutation.mutateAsync({ jahr: taxYear, data: { text } })
        await invalidate()
      }}
      onEditNote={async (id, text) => {
        await updateNoteMutation.mutateAsync({ jahr: taxYear, noteId: id, data: { text } })
        await invalidate()
      }}
      onDeleteNote={async (id) => {
        await deleteNoteMutation.mutateAsync({ jahr: taxYear, noteId: id })
        await invalidate()
      }}
      onUndoNoteChange={async (messageId, index) => {
        await undoNoteChangeMutation.mutateAsync({ jahr: taxYear, messageId, index })
        await invalidate()
      }}
      situation={session ? (session.situation?.text ?? '') : undefined}
      onSaveSituation={async (text) => {
        await saveSituationMutation.mutateAsync({ jahr: taxYear, data: { text } })
        await invalidate()
      }}
      opening={
        openingState
          ? {
              stage: openingState.stage,
              ...(!openingState.shouldOpen && openingState.lastOpening
                ? { lastOpeningAt: openingState.lastOpening.createdAt, onOpenLast: () => selectConversation(openingState.lastOpening!.conversationId) }
                : {}),
            }
          : undefined
      }
      connection={connectionView}
      onRecheckConnection={() => connectionQuery.refetch()}
      conversations={session?.conversations}
      models={modelsQuery.data?.data ?? null}
      chatModel={session?.conversations?.find((c) => c.id === session.conversationId)?.chatModel ?? null}
      onPickModel={
        session
          ? reported(async (model: Parameters<NonNullable<OwlModeScreenProps['onPickModel']>>[0]) => {
              await setConversationModelMutation.mutateAsync({ jahr: taxYear, conversationId: session.conversationId, data: model ?? { provider: null, model: null } })
              await invalidate()
            })
          : undefined
      }
      onSearchConversations={searchConversations}
      activeConversationId={session?.conversationId ?? null}
      onSelectConversation={(id) => selectConversation(id)}
      projects={session?.projects}
      onSelectConversationInYear={bridge ? (year, id) => bridge.openConversationInYear(year, id) : undefined}
      onNewConversation={reported(async () => {
        const response = await createConversationMutation.mutateAsync({ jahr: taxYear })
        selectConversation(response.data.id)
        await invalidate()
      })}
      onRenameConversation={async (id, title) => {
        await renameConversationMutation.mutateAsync({ jahr: taxYear, conversationId: id, data: { title } })
        await invalidate()
      }}
      onDeleteConversation={async (id) => {
        await deleteConversationMutation.mutateAsync({ jahr: taxYear, conversationId: id })
        // The open one is gone: back to whichever was used last.
        if (id === session?.conversationId) selectConversation(null)
        await invalidate()
      }}
      onClearConversation={async () => {
        await clearConversationMutation.mutateAsync({ jahr: taxYear, ...(session ? { params: { conversationId: session.conversationId } } : {}) })
        await invalidate()
      }}
      onSendMessage={async (text, options) => {
        if (bridge) {
          const activeScreen = bridge.owlViewMode.kind === 'mask' ? bridge.owlViewMode.screen : undefined
          // null: the request failed (the chat error says why) — the composer keeps the text (WEB-14).
          return (await bridge.sendStreamingMessage(text, activeScreen, options)) !== null
        }
        try {
          await sendMessageMutation.mutateAsync({ jahr: taxYear, data: { message: text, ...sendOptionsToDto(options) } })
        } catch (error) {
          setActionError(error)
          return false
        }
        await invalidate()
        return true
      }}
      onApplyAction={async (actionId) => {
        if (bridge) {
          await bridge.applySingleAction(actionId)
          return
        }
        await applyActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
      onDismissAction={reported(
        async (actionId: string) => {
          await dismissActionMutation.mutateAsync({ jahr: taxYear, actionId })
          await invalidate()
        },
        { rethrow: true },
      )}
      onUndoAction={async (actionId) => {
        if (bridge) {
          await bridge.undoSingleAction(actionId)
          return
        }
        await undoActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
    />
    </OwlVoiceContext.Provider>
  )
}
