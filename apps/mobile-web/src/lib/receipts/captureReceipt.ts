import {
  receiptParseControllerParseReceipt,
  uploadReceiptFile,
  type ParseReceiptDto,
  type ParseReceiptDtoExpectedKind,
  type ParseReceiptDtoMask,
  type ParseReceiptResponseDto,
  type ParsedReceiptProcessingDto,
} from '@steuereule/api-client'
import { classifyDocumentKind, type DetectedDocumentKind } from '@steuereule/core'
import { detectDocumentMimeType, extractDocumentTextOnDevice, type OcrStage } from '../documentOcr'
import { thrownUploadError, uploadFailureError } from './uploadFailure'

/** Visible progress of one receipt capture. */
export type CapturePhase = 'uploading' | OcrStage | 'parsing'

/** `read_failed`: the device could not read the file (damaged/encrypted PDF, OCR engine did not start). */
export type CaptureFailure = 'unsupported_file' | 'read_failed' | 'empty_text' | 'parse_failed'

export type CaptureResult =
  | {
      readonly ok: true
      readonly kind: DetectedDocumentKind
      /** The stored Beleg (encrypted original), or null when the upload was not possible. */
      readonly receiptId: string | null
      readonly response: ParseReceiptResponseDto
      /** The text read on the device: kept only in memory, to read the document again for someone else. */
      readonly rawText: string
      readonly textSource: 'pdf_text' | 'ocr' | 'einvoice'
      /** Why the original could not be stored (WEB-10: a 413/429 is said, the reading went on without it). */
      readonly uploadError?: unknown
    }
  | {
      readonly ok: false
      readonly failure: CaptureFailure
      /** The stored Beleg, when there is one: a device failure is recorded on it (ADR-0097). */
      readonly receiptId?: string | null | undefined
      /** The Beleg's state after the failure was recorded; absent when nothing could be recorded. */
      readonly processing?: ParsedReceiptProcessingDto | null | undefined
      /** The rejected parse (an ApiError or NetworkError), for `net/apiFailure` — e.g. a guest needs an account (WEB-11). */
      readonly error?: unknown
      readonly uploadError?: unknown
    }

export interface CaptureReceiptOptions {
  readonly taxYear: number
  /** Force a strategy (the LStB mask); otherwise the text decides (chat, inbox). */
  readonly kind?: DetectedDocumentKind | 'geschaeftsbeleg' | undefined
  /** A business receipt (ADR-0101 §6): an expense or an invoice the business wrote; the draft is a booking in that direction. */
  readonly direction?: 'ausgabe' | 'einnahme' | undefined
  /** A business receipt: which business of the account holder books it (ADR-0101 §22). */
  readonly business?: number | undefined
  /** Entry context (ADR-0097 §4): the document a mask expects; unlike `kind` it does not force a reader. */
  readonly expectedKind?: ParseReceiptDtoExpectedKind | undefined
  /** Entry context: the mask the upload happened in. */
  readonly mask?: ParseReceiptDtoMask | undefined
  /** Stage drafts although the Beleg is a duplicate of an older upload. */
  readonly allowDuplicate?: boolean | undefined
  readonly person?: 'A' | 'B' | undefined
  /** The person whose mask the upload happened in (ADR-0092): `A`, `B` or `kind:<id>`. */
  readonly area?: string | undefined
  /** The user's answer to „Für wen?“ (ADR-0092): final. */
  readonly holder?: string | undefined
  /** „Auch für … übernehmen?“: link the document to `holder` as well. */
  readonly alsoFor?: boolean | undefined
  /** The Beleg is already stored (parsing again after the user said whose it is): no second upload. */
  readonly receiptId?: string | null | undefined
  /**
   * `false`: only read and recognise the document (its kind is filed, whose it is is noted), without
   * staging drafts — the Belege inbox files a fresh upload, the user decides when the owl takes its values.
   */
  readonly stageDraft?: boolean | undefined
  /** Uploaded in the chat of `taxYear`: the Beleg is filed in that year unless the document names another. */
  readonly inChat?: boolean | undefined
  readonly onPhase?: ((phase: CapturePhase) => void) | undefined
  readonly deps?: Partial<CaptureReceiptDeps> | undefined
}

export interface CaptureReceiptDeps {
  readonly upload: typeof uploadReceiptFile
  readonly extractText: typeof extractDocumentTextOnDevice
  readonly parse: typeof receiptParseControllerParseReceipt
}

const DEFAULT_DEPS: CaptureReceiptDeps = {
  upload: uploadReceiptFile,
  extractText: extractDocumentTextOnDevice,
  parse: receiptParseControllerParseReceipt,
}

/** What the server records for a file the device could not read (ADR-0097: the Beleg says so instead of staying „neu“). */
const DEVICE_READ_FAILURES = { read_failed: 'read_failed', empty_text: 'empty_text', unsupported_file: 'unsupported_file' } as const

/**
 * The one receipt pipeline (#444), shared by the LStB mask, the Belege inbox and the chat:
 * 1. store the original encrypted in the Belege inbox,
 * 2. read its text ON THE DEVICE (PDF text layer or self-hosted OCR, ADR-0060),
 * 3. route it to a parse strategy (LStB or generic receipt),
 * 4. parse — Zero-Write: the server only stages proposals the user confirms.
 * No image or PDF ever goes to a model; only the extracted text reaches the server.
 */
export async function captureReceipt(file: File, options: CaptureReceiptOptions): Promise<CaptureResult> {
  const deps = { ...DEFAULT_DEPS, ...options.deps }
  if (detectDocumentMimeType(new Uint8Array(0), file.type, file.name) === null) {
    // A file that is not stored yet is never uploaded; one already stored says why it stays unread.
    return deviceFailure(deps, options, file.name, options.receiptId ?? null, 'unsupported_file')
  }

  let receiptId: string | null = options.receiptId ?? null
  let uploadError: unknown = undefined
  if (options.receiptId === undefined) {
    options.onPhase?.('uploading')
    try {
      const uploaded = await deps.upload({ file, fileName: file.name, kind: 'Sonstiges' })
      if (uploaded.ok) receiptId = uploaded.data.id
      else uploadError = uploadFailureError(uploaded)
    } catch (thrown) {
      // Reading and parsing still help without the stored original (e.g. offline upload error).
      uploadError = thrownUploadError(thrown)
    }
  }
  const withUploadError = uploadError === undefined ? {} : { uploadError }

  let extracted: Awaited<ReturnType<CaptureReceiptDeps['extractText']>>
  try {
    extracted = await deps.extractText(file, {
      fileName: file.name,
      mimeType: file.type,
      onProgress: (progress) => {
        if (progress.stage !== 'done') options.onPhase?.(progress.stage)
      },
    })
  } catch {
    return deviceFailure(deps, options, file.name, receiptId, 'read_failed')
  }
  if (extracted.text.trim().length === 0) return deviceFailure(deps, options, file.name, receiptId, 'empty_text')

  const kind: DetectedDocumentKind | 'geschaeftsbeleg' = options.kind ?? classifyDocumentKind(extracted.text)
  const payload: ParseReceiptDto = {
    taxYear: options.taxYear,
    kind,
    fileName: file.name,
    rawText: extracted.text,
    textSource: extracted.einvoice ? 'einvoice' : extracted.kind === 'pdf' && !extracted.usedOcrFallback ? 'pdf_text' : 'ocr',
    stageDraft: options.stageDraft ?? true,
    ...(options.expectedKind !== undefined ? { expectedKind: options.expectedKind } : {}),
    ...(options.mask !== undefined ? { mask: options.mask } : {}),
    ...(options.allowDuplicate === true ? { allowDuplicate: true } : {}),
    ...(receiptId !== null ? { receiptId } : {}),
    ...(options.person === 'B' ? { person: 'B' } : {}),
    ...(options.area !== undefined ? { area: options.area } : {}),
    ...(options.holder !== undefined ? { holder: options.holder } : {}),
    ...(options.alsoFor === true ? { alsoFor: true } : {}),
    ...(options.inChat === true ? { inChat: true } : {}),
    ...(options.direction !== undefined ? { direction: options.direction } : {}),
    ...(options.business !== undefined && options.business > 1 ? { business: options.business } : {}),
  }

  options.onPhase?.('parsing')
  try {
    const parsed = await deps.parse(payload)
    return { ok: true, kind: kind as DetectedDocumentKind, receiptId, response: parsed.data, rawText: extracted.text, textSource: payload.textSource ?? 'ocr', ...withUploadError }
  } catch (error) {
    return { ok: false, failure: 'parse_failed', error, ...withUploadError }
  }
}

/** Records on the stored Beleg that the device could not read it; without a stored Beleg there is nothing to record. */
async function deviceFailure(
  deps: CaptureReceiptDeps,
  options: CaptureReceiptOptions,
  fileName: string,
  receiptId: string | null,
  failure: keyof typeof DEVICE_READ_FAILURES,
): Promise<CaptureResult> {
  if (receiptId === null) return { ok: false, failure, receiptId: null, processing: null }
  try {
    const recorded = await deps.parse({
      taxYear: options.taxYear,
      fileName: fileName.trim() === '' ? 'beleg' : fileName,
      receiptId,
      deviceReadFailure: DEVICE_READ_FAILURES[failure],
      ...(options.inChat === true ? { inChat: true } : {}),
    })
    return { ok: false, failure, receiptId, processing: recorded.data.processing ?? null }
  } catch {
    return { ok: false, failure, receiptId, processing: null }
  }
}
