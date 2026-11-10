import type { CreateReceiptDtoKind, ReceiptResponseDto } from './generated/belege.schemas'
import { getApiClientBaseUrl } from './http-client'

export interface UploadReceiptFileInput {
  readonly file: Blob
  readonly fileName?: string
  readonly kind?: CreateReceiptDtoKind
  readonly belegdatum?: string
  readonly zahlungsdatum?: string
}

export type UploadReceiptFileResult =
  | { readonly ok: true; readonly status: 201; readonly data: ReceiptResponseDto; readonly headers: Headers }
  | {
      readonly ok: false
      readonly status: number
      readonly data: { readonly code?: string; readonly message?: string } | null
      readonly headers: Headers
    }

export type FetchReceiptFileResult =
  | {
      readonly ok: true
      readonly status: number
      readonly headers: Headers
      readonly blob: Blob
      readonly mimeType: string
    }
  | {
      readonly ok: false
      readonly status: number
      readonly headers: Headers
    }

export function getReceiptFileUrl(id: string): string {
  return `${getApiClientBaseUrl()}/v1/belege/${encodeURIComponent(id)}/datei`
}

export async function uploadReceiptFile(
  input: UploadReceiptFileInput,
  options?: Pick<RequestInit, 'signal'>,
): Promise<UploadReceiptFileResult> {
  const form = new FormData()
  const resolvedName =
    input.fileName ??
    (typeof File !== 'undefined' && input.file instanceof File && input.file.name ? input.file.name : 'beleg')
  form.append('file', input.file, resolvedName)

  if (input.kind !== undefined) form.append('kind', input.kind)
  if (input.belegdatum !== undefined) form.append('belegdatum', input.belegdatum)
  if (input.zahlungsdatum !== undefined) form.append('zahlungsdatum', input.zahlungsdatum)

  const response = await fetch(`${getApiClientBaseUrl()}/v1/belege/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    ...(options?.signal ? { signal: options.signal } : {}),
  })

  const rawText = response.status === 204 ? '' : await response.text()
  let parsed: unknown = null
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as unknown
    } catch {
      parsed = { message: rawText }
    }
  }

  if (response.status === 201) {
    return { ok: true, status: 201, data: parsed as ReceiptResponseDto, headers: response.headers }
  }
  return {
    ok: false,
    status: response.status,
    data: (parsed as { readonly code?: string; readonly message?: string } | null) ?? null,
    headers: response.headers,
  }
}

export async function fetchReceiptFileBlob(
  id: string,
  options?: Pick<RequestInit, 'signal'>,
): Promise<FetchReceiptFileResult> {
  const response = await fetch(getReceiptFileUrl(id), {
    method: 'GET',
    credentials: 'include',
    ...(options?.signal ? { signal: options.signal } : {}),
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      headers: response.headers,
    }
  }

  const blob = await response.blob()
  const mimeType = response.headers.get('content-type') || blob.type || 'application/octet-stream'
  return {
    ok: true,
    status: response.status,
    headers: response.headers,
    blob,
    mimeType,
  }
}
