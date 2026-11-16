import { fetchReceiptFileBlob } from '@steuereule/api-client'

/** The stored original of a Beleg as a file again, so the device can read it; null when it is gone or unreachable. */
export async function storedReceiptFile(receipt: { readonly id: string; readonly fileName: string }): Promise<File | null> {
  try {
    const res = await fetchReceiptFileBlob(receipt.id)
    if (!res.ok) return null
    return new File([res.blob], receipt.fileName, { type: res.mimeType })
  } catch {
    return null
  }
}
