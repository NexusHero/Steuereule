import { getApiClientBaseUrl, type ReceiptResponseDto, type uploadReceiptFile } from '@steuereule/api-client'

/**
 * Stores a business receipt (ADR-0101 §6): the upload carries the direction, which files the Beleg as
 * Geschaeftsbeleg. The shared client's upload has no such field yet, so the one request is made here;
 * the result has the shape `captureReceipt` expects of its `upload` dependency.
 */
export const uploadBusinessReceipt =
  (direction: 'ausgabe' | 'einnahme'): typeof uploadReceiptFile =>
  async (input) => {
    const form = new FormData()
    form.append('file', input.file, input.fileName ?? 'beleg')
    form.append('direction', direction)
    const response = await fetch(`${getApiClientBaseUrl()}/v1/belege/upload`, { method: 'POST', body: form, credentials: 'include' })
    const text = response.status === 204 ? '' : await response.text()
    const parsed: unknown = text === '' ? null : JSON.parse(text)
    if (response.status === 201) return { ok: true, status: 201, data: parsed as ReceiptResponseDto, headers: response.headers }
    return { ok: false, status: response.status, data: (parsed as { code?: string; message?: string } | null) ?? null, headers: response.headers }
  }
