import { uploadReceiptFile, type CreateReceiptDtoKind } from '@steuereule/api-client'
import { thrownUploadError, uploadFailureError } from './uploadFailure'

export type StoreReceiptResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: unknown }

/**
 * Stores the original encrypted in the Belege inbox (ADR-0097 §4). A failure carries the error to classify
 * with `net/apiFailure` (WEB-10: 413, 429 and an account requirement are not "check the connection").
 */
export async function storeReceipt(file: File, kind: CreateReceiptDtoKind): Promise<StoreReceiptResult> {
  try {
    const result = await uploadReceiptFile({ file, fileName: file.name, kind })
    return result.ok ? { ok: true, id: result.data.id } : { ok: false, error: uploadFailureError(result) }
  } catch (thrown) {
    return { ok: false, error: thrownUploadError(thrown) }
  }
}
