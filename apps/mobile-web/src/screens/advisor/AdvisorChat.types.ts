import type { AdvisorChatModelRefDto, AdvisorModelsDto } from '@steuereule/api-client'
import type { ReactNode } from 'react'
import type {
  AdvisorChatMessageView,
  AdvisorFeedbackRating,
  AdvisorFeedbackReason,
  AdvisorQuickAction,
  AdvisorSkillId,
  AdvisorThoughtStep,
  Screen,
} from '@steuereule/core'
import type { DictationEngine } from '../../lib/dictation/engine'
import type { ContextRingState } from './chat/ContextRing'
import type { AbortedTurn, AdvisorPlanView } from './CopilotBridgeProvider'

export interface AdvisorChatPanelProps {
  /** The chat models the user may pick, with their cost (ADR-0096); absent hides the picker and Max. */
  readonly models?: AdvisorModelsDto | null | undefined
  /** The model picked for the open conversation; null = the standard model. */
  readonly chatModel?: AdvisorChatModelRefDto | null | undefined
  readonly onPickModel?: ((model: AdvisorChatModelRefDto | null) => void) | undefined
  readonly greeting?: string | undefined
  readonly messages: readonly AdvisorChatMessageView[]
  readonly quickChips?: readonly (string | AdvisorQuickChip)[] | undefined
  /** What the owl knows about the household, as a chip in the composer (#476 chat-first). */
  readonly situationChip?: ReactNode | undefined
  /** One quiet line under the composer, e.g. the legal status of the owl's sources. */
  readonly footnote?: string | undefined
  readonly isSending?: boolean | undefined
  readonly streamSteps?: readonly AdvisorThoughtStep[] | undefined
  readonly streamedText?: string | undefined
  /** The reasoning summary of the running answer, as far as it has arrived (#476). */
  readonly streamedReasoning?: string | undefined
  /** The question of the running turn; shown until `messages` contains it. */
  readonly pendingUserMessage?: AdvisorChatMessageView | null | undefined
  /** True while the connection to a running answer is being restored. */
  readonly reconnecting?: boolean | undefined
  /**
   * How a new conversation starts (ADR-0067 §11): with nothing entered the chat offers to start
   * the interview; when nothing changed since the last opening, it links to that one.
   */
  readonly opening?: AdvisorChatOpening | undefined
  /** How full the context of this conversation is, and where its summarised part ends (#481). */
  readonly context?: (ContextRingState & { readonly summary?: string | undefined; readonly summarizedUntilMessageId?: string | undefined }) | undefined
  readonly onSummarize?: (() => Promise<void>) | undefined
  /** Takes back one change the owl made to the project notes in an answer (#481). */
  readonly onUndoNoteChange?: ((messageId: string, index: number) => Promise<void>) | undefined
  /** Adds a sentence the owl suggested to the user's description of the situation (#501). */
  readonly onAcceptSituationSuggestion?: ((text: string) => Promise<void>) | undefined
  /** Stores a rating; without it the chat offers none (e.g. the local preview). */
  readonly onRateMessage?:
    | ((messageId: string, rating: AdvisorFeedbackRating | null, reason?: AdvisorFeedbackReason) => Promise<void> | void)
    | undefined
  readonly chatError?: string | null | undefined
  readonly basisMode?: boolean | undefined
  /** Resolves `false` when the message did not reach the owl: the composer keeps the text (WEB-14). */
  readonly onSendMessage: (text: string, options?: ChatSendOptions) => Promise<boolean | void> | boolean | void
  /** On-device dictation (#451 slice 5); the browser engine unless a test passes its own. */
  readonly dictationEngine?: DictationEngine | undefined
  /** The plan of the current or last answer (#451 slice 6). */
  readonly plan?: AdvisorPlanView | null | undefined
  /** Stops the running answer; without it the chat offers no Stop (e.g. the non-streaming companion). */
  readonly onStop?: (() => void) | undefined
  /** The last answer the user stopped: partial text, marked as aborted, with „Noch mal fragen“. */
  readonly abortedTurn?: AbortedTurn | null | undefined
  readonly onApplyAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndoAction?: ((actionId: string) => Promise<void> | void) | undefined
  /** Refuses a pending draft; without it the cards offer no discard. */
  readonly onDismissAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly receiptLinkedActionIds?: ReadonlySet<string> | undefined
  /** The spouse's first name: a draft for Person B says „für …“ (ADR-0073). */
  readonly partnerName?: string | undefined
  /** The user's first name and whether the return is a joint one: then every card on a mask of one spouse names its owner. */
  readonly ownName?: string | undefined
  readonly jointReturn?: boolean | undefined
  readonly onAttachReceipt?: ((input: { readonly fileName: string; readonly rawText: string }) => Promise<void> | void) | undefined
  /** Upload a PDF or photo: stored encrypted, read on the device, parsed (#444). */
  /** Resolves when the file has been read: several files are read one after another (#497). */
  readonly onAttachReceiptFile?: ((file: File) => Promise<void>) | undefined
  /** Visible progress text of the running receipt capture, if any. */
  readonly receiptProgress?: string | null | undefined
  readonly receiptNotice?: string | null | undefined
  /** „Für wen?“ and „für: … · auch für …?“ of the last document (ADR-0092), shown under the upload. */
  readonly receiptAssignment?: ReactNode | undefined
  /** One line per file of the last selection (ADR-0097 §3), shown with the notice. */
  readonly receiptResults?: ReactNode | undefined
  /** The user picks files while none is queued: a new selection starts, the lines of the last one go. */
  readonly onReceiptBatchStart?: (() => void) | undefined
  /** The last document still waits for an answer („Für wen?“): the next file of a selection is not started yet. */
  readonly receiptQueuePaused?: boolean | undefined
  /** More ways to hand the owl a document, shown in the attach panel (e.g. one already in the Belege inbox). */
  readonly receiptSources?: ReactNode | undefined
  readonly isParsingReceipt?: boolean | undefined
  readonly compact?: boolean | undefined
  /**
   * `panel` (default): a card among other content, scrolled by its surroundings. `page`: the chat
   * is the screen, with its own scrolling conversation in a reading column and a fixed composer.
   */
  readonly variant?: 'panel' | 'page' | undefined
}

/** How a message is sent: a quick start, or replacing the latest turn (regenerate / edit, #451 1b). */
export interface ChatSendOptions {
  readonly quickAction?: AdvisorQuickAction | undefined
  readonly replaceFromMessageId?: string | undefined
  /** The skill that is on for this message (#495). */
  readonly skill?: AdvisorSkillId | undefined
  /** Turbo mode: the owl applies the drafts of this answer itself. */
  readonly turbo?: boolean | undefined
  /** Max instead of Gründlich for this one message (ADR-0096). */
  readonly depth?: 'max' | undefined
}

export interface AdvisorChatOpening {
  readonly stage: 'empty' | 'partial' | 'ready'
  /** ISO date of the last opening of the year, when the chat should link to it instead of opening again. */
  readonly lastOpeningAt?: string | undefined
  readonly onOpenLast?: (() => void) | undefined
}

/** A quick-start chip that also tells the server how to run the turn (e.g. always with a plan). */
export interface AdvisorQuickChip {
  readonly label: string
  readonly testID: string
  readonly quickAction?: AdvisorQuickAction | undefined
}
