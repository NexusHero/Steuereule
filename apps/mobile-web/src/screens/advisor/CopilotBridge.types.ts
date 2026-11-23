import type { ReactNode } from 'react'
import type { AdvisorActionProposal, AdvisorChatMessageView, AdvisorPlanStepStatus, AdvisorQuickAction, AdvisorSkillId, AdvisorThoughtStep, Screen } from '@steuereule/core'
import type { AssignmentPersonDto, AssignmentQuestionDto, ParseReceiptDtoMimeType, ParseReceiptResponseDto } from '@steuereule/api-client'
import type { CapturePhase, CaptureResult } from '../../lib/receipts/captureReceipt'
import type { ReceiptOutcome } from '../../lib/receipts/receiptOutcome'
import type { NewHolderDetails } from '../../lib/receipts/documentAssignment'

export type CopilotMode = 'cockpit' | 'eulen-modus'

export type OwlViewMode =
  | { readonly kind: 'stage' }
  | { readonly kind: 'mask'; readonly screen: Screen; readonly field?: string | undefined }

export type TileProvenanceKind = 'beleg+eule' | 'eule' | 'nutzer'

export interface CockpitBannerState {
  readonly appliedCount: number
  readonly screens: readonly Screen[]
  readonly lastDeltaEur: number
  readonly timestamp: number
}

export interface StaleFieldConflict {
  readonly actionId?: string | undefined
  readonly key: string
  readonly currentValue: string | null
}

export interface StaleConflictState {
  readonly actionIds: readonly string[]
  readonly message: string
  /** Fields that changed under the draft, with the value the server saw — re-sent to re-baseline. */
  readonly conflicts: readonly StaleFieldConflict[]
}

/** A turn the user stopped: its partial text stays visible, nothing of it is persisted or applicable. */
export interface AbortedTurn {
  readonly question: string
  readonly partialText: string
}

/** One step of the owl's plan as the chat shows it; `abgebrochen` only ever comes from Stop. */
export interface PlanStepView {
  readonly text: string
  readonly status: AdvisorPlanStepStatus | 'abgebrochen'
}

/** The plan of the current (or last) answer, kept per answer and never persisted (#451 slice 6). */
export interface AdvisorPlanView {
  readonly steps: readonly PlanStepView[]
  readonly finished: boolean
}

export interface SendStreamingOptions {
  readonly quickAction?: AdvisorQuickAction | undefined
  /** Regenerate / edit-and-resend: the latest user message whose turn the answer replaces. */
  readonly replaceFromMessageId?: string | undefined
  readonly skill?: AdvisorSkillId | undefined
  readonly turbo?: boolean | undefined
  /** Max instead of Gründlich for this one message (ADR-0096). */
  readonly depth?: 'max' | undefined
}

/** Messages on success, `null` on a failure (shown via `chatError`), `'aborted'` when the user stopped. */
export type StreamOutcome = AdvisorChatMessageView[] | null | 'aborted'

export interface ParseReceiptInput {
  readonly fileName: string
  readonly rawText?: string | undefined
  readonly mimeType?: ParseReceiptDtoMimeType | undefined
  readonly stageDraft?: boolean | undefined
}

/** What became of one file of a chat upload (ADR-0097 §3): one line per file, from the server's state. */
export interface ChatReceiptResult {
  /** The Beleg's id, or the file name when it could not be stored. */
  readonly key: string
  readonly fileName: string
  readonly outcome: ReceiptOutcome
  /** „Für wen?“ is open for this file: nothing was read for anyone yet. */
  readonly asking: boolean
}

export interface CopilotBridgeContextValue {
  readonly mode: CopilotMode
  readonly insideOwlWorkspace: boolean
  readonly taxYear: number
  readonly isAuthenticated: boolean
  readonly setMode: (next: CopilotMode) => void
  readonly owlViewMode: OwlViewMode
  readonly openMaskPreview: (screen: Screen, field?: string) => void
  readonly returnToStage: () => void
  readonly streaming: boolean
  readonly streamSteps: readonly AdvisorThoughtStep[]
  readonly streamedText: string
  /** The reasoning summary of the running answer, as far as it has arrived (#476). */
  readonly streamedReasoning: string
  /** The question of the running turn, known from its first event; shown until the session has it. */
  readonly pendingUserMessage: AdvisorChatMessageView | null
  /** True while the connection to a running answer is being restored. */
  readonly reconnecting: boolean
  /** The conversation the chat is in (#481); null = the one used last in this tax year. */
  readonly conversationId: string | null
  readonly setConversationId: (id: string | null) => void
  /** Tells the provider which conversation the screen shows, once the server has said so. */
  readonly adoptConversationId: (id: string) => void
  /** Opens a conversation of any tax year; another year switches the whole app to it (#503). */
  readonly openConversationInYear: (year: number, id: string) => void
  /** The conversations this device is following an answer in right now; several at once are fine. */
  readonly answeringConversationIds: readonly string[]
  /** Follows an answer that was found still running, e.g. after a reload. */
  readonly resumeRun: (runId: string) => Promise<StreamOutcome>
  /** True when the last answer came from the deterministic engine because no model answered. */
  readonly basisMode: boolean
  readonly chatError: string | null
  readonly clearChatError: () => void
  readonly sendStreamingMessage: (message: string, activeScreen?: Screen, options?: SendStreamingOptions) => Promise<StreamOutcome>
  readonly plan: AdvisorPlanView | null
  /** Stops the running answer (Stop button, Escape). The partial text becomes `abortedTurn`. */
  readonly stopStreaming: () => void
  readonly abortedTurn: AbortedTurn | null
  readonly clearAbortedTurn: () => void
  readonly batchApplying: boolean
  readonly staleConflict: StaleConflictState | null
  readonly clearStaleConflict: () => void
  readonly applyAllPending: (
    drafts: readonly AdvisorActionProposal[],
    options?: { readonly acknowledgedConflict?: StaleConflictState | undefined; /** Stay in the owl instead of jumping to the cockpit. */ readonly stay?: boolean | undefined },
  ) => Promise<boolean>
  readonly applySingleAction: (actionId: string) => Promise<boolean>
  /** Why the last single apply was refused (the API's German reason), for the card of that draft. */
  readonly applyFailure: { readonly actionId: string; readonly message: string } | null
  readonly undoSingleAction: (actionId: string) => Promise<boolean>
  readonly parsingReceipt: boolean
  readonly lastParsedReceipt: ParseReceiptResponseDto | null
  readonly receiptLinkedActionIds: ReadonlySet<string>
  readonly parseReceipt: (input: ParseReceiptInput) => Promise<ParseReceiptResponseDto | null>
  /** Upload a PDF or photo from the chat: stored encrypted, read on the device, parsed (#444). */
  readonly captureReceiptFile: (file: File) => Promise<CaptureResult | null>
  /**
   * Reads a document that already lies in the Belege inbox (the file as uploaded there, or its stored
   * original fetched again): the same reading and drafts as a chat upload, without a second copy.
   */
  readonly readStoredReceipt: (file: File, receiptId: string) => Promise<CaptureResult | null>
  readonly receiptPhase: CapturePhase | null
  /** A sentence of the reader itself after a capture (Person B keeps an own account, a health statement's summary); the outcome per file is in `receiptResults`. */
  readonly receiptNotice: string | null
  readonly clearReceiptNotice: () => void
  /** One line per file of the last selection, kept until the next selection starts (ADR-0097 §3). */
  readonly receiptResults: readonly ChatReceiptResult[]
  /** A new selection of files starts: the lines of the last one go. */
  readonly startReceiptBatch: () => void
  readonly clearReceiptResults: () => void
  /** Opens another tax year for the whole app (drafts of a Beleg went there, ADR-0097 §5). */
  readonly switchTaxYear: (year: number) => void
  /** „Für wen?“ (ADR-0092): a document waits for the user to say whose it is; nothing is read for anyone yet. */
  readonly documentQuestion: { readonly question: AssignmentQuestionDto; readonly printed: NewHolderDetails } | null
  /** Whose the last document is („für: …“) and whom else a multi-person document names („auch für …?“). */
  readonly documentHolder: { readonly holder: AssignmentPersonDto; readonly alsoFor: readonly AssignmentPersonDto[] } | null
  readonly assignmentBusy: boolean
  readonly assignmentError: string | null
  readonly chooseDocumentHolder: (holder: string) => Promise<void>
  readonly createDocumentHolder: (role: 'B' | 'kind', details: NewHolderDetails) => Promise<void>
  readonly confirmDocumentSelf: (takeName: boolean) => Promise<void>
  readonly takeDocumentAlsoFor: (holder: string) => Promise<void>
  readonly provenanceByScreen: Readonly<Partial<Record<Screen, TileProvenanceKind>>>
  readonly bestTileProvenance: (screens: readonly Screen[]) => TileProvenanceKind | null
  readonly cockpitBanner: CockpitBannerState | null
  readonly dismissCockpitBanner: () => void
}

export interface CopilotBridgeProviderProps {
  readonly mode: CopilotMode
  readonly onModeChange: (next: CopilotMode) => void
  readonly taxYear: number
  /** Opens another tax year for the whole app: a conversation of that year was chosen in the owl (#503). */
  readonly onSwitchYear?: ((year: number) => void) | undefined
  readonly isAuthenticated?: boolean | undefined
  readonly children: ReactNode
}
