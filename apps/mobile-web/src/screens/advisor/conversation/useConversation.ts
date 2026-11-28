import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getApiClientBaseUrl } from '@steuereule/api-client'
import { createConversation, type AnswerUpdate, type Conversation, type ConversationDeps, type ConversationSnapshot } from '../../../lib/conversation/conversation'
import { apiFetch } from '../../../net/apiFetch'

/** The words of an utterance from the API (ADR-0115). A refusal rejects: the conversation says it did not understand. */
export async function hearOnServer(wav: Blob, language: string): Promise<string> {
  const form = new FormData()
  // The language goes first: the server reads the fields that come before the file.
  form.set('language', language.toLowerCase().startsWith('en') ? 'en' : 'de')
  form.set('file', wav, 'aufnahme.wav')
  const response = await apiFetch(`${getApiClientBaseUrl()}/v1/eulen-modus/gehoert`, { method: 'POST', credentials: 'include', body: form })
  if (!response.ok) throw new Error('the server could not write down the utterance')
  const body = (await response.json()) as { readonly text?: unknown }
  return typeof body.text === 'string' ? body.text : ''
}

export interface UseConversation {
  readonly snapshot: ConversationSnapshot
  readonly conversation: Pick<Conversation, 'start' | 'stop' | 'interrupt' | 'endUtterance'>
}

/**
 * One spoken conversation for as long as the screen that shows it lives. `answer` is the chat's view of the
 * answer to what was said; it is handed on whenever it changes. Leaving the screen ends the conversation
 * and releases the microphone.
 */
export function useConversation(deps: ConversationDeps, answer: AnswerUpdate): UseConversation {
  // The newest functions of the chat, without making a new conversation when they change identity.
  const latest = useRef(deps)
  latest.current = deps
  const made = useRef<Conversation | null>(null)
  made.current ??= createConversation({
    ...deps,
    hear: (wav, language) => latest.current.hear(wav, language),
    send: (text) => latest.current.send(text),
    stopAnswer: () => latest.current.stopAnswer?.(),
  })
  const conversation = made.current
  const snapshot = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot, conversation.getSnapshot)

  const { text, running, answerId } = answer
  useEffect(() => {
    conversation.answer({ text, running, answerId })
  }, [conversation, text, running, answerId])

  useEffect(() => () => conversation.stop(), [conversation])

  return { snapshot, conversation }
}
