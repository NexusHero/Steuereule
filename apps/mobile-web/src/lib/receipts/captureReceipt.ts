import {
  receiptParseControllerParseReceipt,
  uploadReceiptFile,
  type ParseReceiptDto,
  type ParseReceiptResponseDto,
} from '@steuereule/api-client'
import { classifyDocumentKind, type DetectedDocumentKind } from '@steuereule/core'
import { detectDocumentMimeType, extractDocumentTextOnDevice, type OcrStage } from '../documentOcr'

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
    }
  | { readonly ok: false; readonly failure: CaptureFailure }

export interface CaptureReceiptOptions {
  readonly taxYear: number
  /** Force a strategy (the LStB mask); otherwise the text decides (chat, inbox). */
  readonly kind?: DetectedDocumentKind | undefined
  readonly person?: 'A' | 'B' | undefined
  /** The Beleg is already stored (parsing again after the user said whose it is): no second upload. */
  readonly receiptId?: string | null | undefined
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
    return { ok: false, failure: 'unsupported_file' }
  }

  let receiptId: string | null = options.receiptId ?? null
  if (options.receiptId === undefined) {
    options.onPhase?.('uploading')
    try {
      const uploaded = await deps.upload({ file, fileName: file.name, kind: 'Sonstiges' })
      if (uploaded.ok) receiptId = uploaded.data.id
    } catch {
      // Reading and parsing still help without the stored original (e.g. offline upload error).
    }
  }

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
    return { ok: false, failure: 'read_failed' }
  }
  if (extracted.text.trim().length === 0) return { ok: false, failure: 'empty_text' }

  const kind = options.kind ?? classifyDocumentKind(extracted.text)
  const payload: ParseReceiptDto = {
    taxYear: options.taxYear,
    kind,
    fileName: file.name,
    rawText: extracted.text,
    textSource: extracted.kind === 'pdf' && !extracted.usedOcrFallback ? 'pdf_text' : 'ocr',
    stageDraft: true,
    ...(receiptId !== null ? { receiptId } : {}),
    ...(options.person === 'B' ? { person: 'B' } : {}),
  }

  options.onPhase?.('parsing')
  try {
    const parsed = await deps.parse(payload)
    if (parsed.status !== 200) return { ok: false, failure: 'parse_failed' }
    return { ok: true, kind, receiptId, response: parsed.data }
  } catch {
    return { ok: false, failure: 'parse_failed' }
  }
}
