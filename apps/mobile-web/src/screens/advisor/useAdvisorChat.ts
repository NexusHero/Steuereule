import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchingSkillCommands, parseSkillCommand, type AdvisorLegalSource, type AdvisorQuickAction, type AdvisorSkillId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { activeModel } from './chat/ModelControls'
import { copyToClipboard } from './chat/clipboard'
import { plainTextForCopy } from './chat/markdownLinks'
import { textToRepeatAfterConsent } from './chat/consentRetry'
import type { AdvisorChatLiveStream, AdvisorChatModel, AdvisorChatPanelProps, AdvisorChatReceipts, ChatSendOptions } from './AdvisorChat.types'
import {
  isStoredInterrupted,
  lastIndexOfRole,
  pastedReceiptInput,
  showsPendingUser,
  visibleMessages,
  withSwitches as mergeSwitches,
  withoutQueuedFile,
} from './AdvisorChatHelpers'

export interface UseAdvisorChatInput {
  readonly model: Pick<AdvisorChatModel, 'models' | 'chatModel'>
  readonly allMessages: AdvisorChatPanelProps['messages']
  readonly stream: Pick<AdvisorChatLiveStream, 'isSending' | 'pendingUserMessage' | 'abortedTurn' | 'plan'>
  readonly receipts: Pick<AdvisorChatReceipts, 'onAttachReceipt' | 'onAttachReceiptFile' | 'onReceiptBatchStart' | 'receiptQueuePaused' | 'isParsingReceipt'>
  readonly dictationEngine: NonNullable<AdvisorChatPanelProps['dictationEngine']>
  readonly onSendMessage: AdvisorChatPanelProps['onSendMessage']
}

/** The chat's own state: input, switches, edit, copy, the receipt queue, and what the list derives. */
export function useAdvisorChat({
  model: { models, chatModel },
  allMessages,
  stream: { isSending, pendingUserMessage, abortedTurn, plan },
  receipts: { onAttachReceipt, onAttachReceiptFile, onReceiptBatchStart, receiptQueuePaused = false, isParsingReceipt = false },
  dictationEngine,
  onSendMessage,
}: UseAdvisorChatInput) {
  const { t: tr } = useTranslation(APP_NS)
  const [inputText, setInputText] = useState('')
  const [selectedSource, setSelectedSource] = useState<AdvisorLegalSource | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  // Several files at once are read one after another: each reading shows its own progress and ends in its own drafts.
  const [fileQueue, setFileQueue] = useState<readonly File[]>([])
  const readingRef = useRef(false)
  // Files the user chose while nothing was queued: a new choice, not the rest of a selection.
  const freshChoiceRef = useRef(new WeakSet<File>())
  useEffect(() => {
    const next = fileQueue[0]
    // A file whose „Für wen?“ is open has not been read yet: starting the next one of the same selection would
    // wipe the question. A file chosen anew replaces an unanswered question, as it always did.
    const waitsForAnswer = receiptQueuePaused && next !== undefined && !freshChoiceRef.current.has(next)
    if (next === undefined || readingRef.current || isParsingReceipt || waitsForAnswer || !onAttachReceiptFile) return
    readingRef.current = true
    void Promise.resolve(onAttachReceiptFile(next)).finally(() => {
      readingRef.current = false
      setFileQueue((prev) => prev.slice(1))
    })
  }, [fileQueue, isParsingReceipt, receiptQueuePaused, onAttachReceiptFile])
  const [receiptTextOpen, setReceiptTextOpen] = useState(false)
  const [receiptFileName, setReceiptFileName] = useState('beleg.pdf')
  const [receiptRawText, setReceiptRawText] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dictationSupported, setDictationSupported] = useState(false)

  useEffect(() => {
    let alive = true
    void dictationEngine
      .support()
      .then((result) => alive && setDictationSupported(result.supported))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [dictationEngine])
  const [editingId, setEditingId] = useState<string | null>(null)
  // With the workbench open the chat column is narrow: the long hint would wrap and be cut off.
  const [composerNarrow, setComposerNarrow] = useState(false)
  const [chipsExpanded, setChipsExpanded] = useState(false)
  // A skill is chosen per session and starts off: the plain chat stays the default.
  const [skill, setSkill] = useState<AdvisorSkillId | null>(null)
  // Off in every new chat: the careful way is the default, Turbo is chosen per session.
  const [turbo, setTurbo] = useState(false)
  // Max is chosen for one message (ADR-0096): it switches off again once that message is sent.
  const [maxDepth, setMaxDepth] = useState(false)
  const chatModelOption = activeModel(models, chatModel)
  const maxOffered = chatModelOption?.depths.some((d) => d.depth === 'max') === true
  const withSwitches = (options: ChatSendOptions | undefined, activeSkill: AdvisorSkillId | null): ChatSendOptions | undefined =>
    mergeSwitches(options, activeSkill, turbo, maxDepth && maxOffered)
  // What was typed last, as typed: the stored question is masked while the consent is missing (ADR-0091).
  const lastTypedRef = useRef<string | null>(null)
  const send = (text: string, options?: ChatSendOptions) => {
    lastTypedRef.current = text
    const merged = withSwitches(options, skill)
    setMaxDepth(false)
    return merged ? onSendMessage(text, merged) : onSendMessage(text)
  }
  const [unknownCommand, setUnknownCommand] = useState<string | null>(null)
  const slashCommands = matchingSkillCommands(inputText)

  /** `/grill-me` switches the skill on and starts it; an unknown command is named, never sent to the owl. */
  function runCommand(text: string): boolean {
    const command = parseSkillCommand(text)
    if (command === null) return false
    setInputText('')
    if (command.kind === 'unknown') {
      setUnknownCommand(command.command)
      return true
    }
    setUnknownCommand(null)
    setSkill(command.skill)
    void onSendMessage(command.rest || tr(`advisor.chat.skills.items.${command.skill}.start`), withSwitches(undefined, command.skill))
    return true
  }

  async function handleSubmit(rawText?: string, quickAction?: AdvisorQuickAction) {
    const text = (rawText ?? inputText).trim()
    if (!text || isSending) return
    if (rawText === undefined) {
      setInputText('')
    }
    const sent = await (quickAction ? send(text, { quickAction }) : send(text))
    if (rawText === undefined) keepIfNotSent(sent, text)
  }

  /** WEB-14: a message that did not reach the owl goes back into the composer (unless the user typed anew). */
  function keepIfNotSent(sent: boolean | void, text: string) {
    if (sent === false) setInputText((current) => (current === '' ? text : current))
  }

  const messages = visibleMessages(allMessages)
  const showPendingUser = showsPendingUser(isSending, pendingUserMessage, messages)
  const lastIsStoredInterrupted = isStoredInterrupted(messages.at(-1))

  // The plan sits above the answer it belongs to: the live one, the stopped one, or the last one.
  const lastAssistantIndex = lastIndexOfRole(messages, 'assistant')
  const lastUserIndex = lastIndexOfRole(messages, 'user')
  const lastUser = lastUserIndex === -1 ? null : messages[lastUserIndex]!
  const canReplace = !isSending && lastUser !== null

  /**
   * „Erlauben“ on the consent card: the conversation goes on with the consent, and nobody retypes
   * anything (ADR-0091). The answer the user has already read stays: replacing it made its questions
   * vanish (real-data run). A question stored in its masked form is sent again as typed, as a new
   * turn, so the owl hears the words; otherwise the owl is told that the consent exists.
   */
  function continueAfterConsent() {
    if (!canReplace || lastUser === null) return
    const repeat = textToRepeatAfterConsent(lastUser.content, lastTypedRef.current)
    void send(repeat !== null && repeat !== lastUser.content ? repeat : tr('owlPersonalData.card.continueMessage'))
  }

  async function copyMessage(id: string, content: string) {
    if (await copyToClipboard(plainTextForCopy(content))) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
    }
  }

  function regenerate() {
    if (!canReplace || lastUser === null) return
    void send(lastUser.content, { replaceFromMessageId: lastUser.id })
  }

  function startEdit() {
    if (!canReplace || lastUser === null) return
    setEditingId(lastUser.id)
    setInputText(lastUser.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setInputText('')
  }
  const planAboveLastAnswer = plan !== null && !isSending && abortedTurn === null

  async function handleReceiptSubmit() {
    if (!onAttachReceipt || isParsingReceipt) return
    const input = pastedReceiptInput(receiptFileName, receiptRawText)
    if (input === null) return
    await onAttachReceipt(input)
    setReceiptRawText('')
    setReceiptOpen(false)
  }

  /** A file picked in the attach panel joins the queue; the first of a selection starts a new batch. */
  function queueFile(file: File) {
    // Several files of one selection arrive one after another before the queue renders.
    if (fileQueue.length === 0 && !readingRef.current) onReceiptBatchStart?.()
    setFileQueue((prev) => {
      if (prev.length === 0) freshChoiceRef.current.add(file)
      return [...prev, file]
    })
  }

  function unqueueFile(file: File) {
    setFileQueue((prev) => withoutQueuedFile(prev, file))
  }

  /** The composer's send: a slash command runs, an edit replaces the latest turn, anything else is sent. */
  function sendFromComposer(text: string) {
    if (runCommand(text)) return
    setInputText('')
    const replaceFromMessageId = editingId
    setEditingId(null)
    void Promise.resolve(replaceFromMessageId ? send(text, { replaceFromMessageId }) : send(text)).then(
      (sent) => keepIfNotSent(sent, text),
      () => keepIfNotSent(false, text),
    )
  }

  const isEmpty = messages.length === 0 && !isSending && abortedTurn === null

  return {
    inputText,
    setInputText,
    selectedSource,
    setSelectedSource,
    receiptOpen,
    setReceiptOpen,
    fileQueue,
    queueFile,
    unqueueFile,
    receiptTextOpen,
    setReceiptTextOpen,
    receiptFileName,
    setReceiptFileName,
    receiptRawText,
    setReceiptRawText,
    copiedId,
    dictationSupported,
    editingId,
    composerNarrow,
    setComposerNarrow,
    chipsExpanded,
    setChipsExpanded,
    skill,
    setSkill,
    turbo,
    setTurbo,
    maxDepth,
    setMaxDepth,
    chatModelOption,
    maxOffered,
    send,
    unknownCommand,
    slashCommands,
    runCommand,
    handleSubmit,
    messages,
    showPendingUser,
    lastIsStoredInterrupted,
    lastAssistantIndex,
    lastUserIndex,
    canReplace,
    continueAfterConsent,
    copyMessage,
    regenerate,
    startEdit,
    cancelEdit,
    planAboveLastAnswer,
    handleReceiptSubmit,
    sendFromComposer,
    isEmpty,
  }
}

export type AdvisorChatState = ReturnType<typeof useAdvisorChat>
