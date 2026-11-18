import { uploadReceiptFile, type CreateReceiptDtoKind } from '@steuereule/api-client'

/** Stores the original encrypted in the Belege inbox (ADR-0097 §4); null when the upload failed. */
export async function storeReceipt(file: File, kind: CreateReceiptDtoKind): Promise<{ readonly id: string } | null> {
  try {
    const result = await uploadReceiptFile({ file, fileName: file.name, kind })
    return result.ok ? { id: result.data.id } : null
  } catch {
    return null
  }
}
