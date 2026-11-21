import { http, HttpResponse } from 'msw'
import { receiptFolderOfKind, type ReceiptFolder } from '@steuereule/core'
import type { ReceiptCountsDto, ReceiptPageResponseDto, ReceiptResponseDto } from '@steuereule/api-client'

/** The counts the server derives over every Beleg of the inbox (the same rules as `ReceiptService.listPage`). */
export function receiptCounts(items: readonly Partial<ReceiptResponseDto>[]): ReceiptCountsDto {
  const folders = { einkuenfte: 0, vorsorge: 0, bescheide: 0, weitere: 0 }
  for (const item of items) folders[receiptFolderOfKind(item.kind ?? null)] += 1
  return {
    total: items.length,
    open: items.filter((item) => item.processing?.open === true).length,
    unassigned: items.filter((item) => item.assignment?.kind !== 'zugeordnet').length,
    folders,
    proposals: items.flatMap((item) => (item.id !== undefined && item.assignment?.kind === 'vorgeschlagen' && typeof item.assignment.taxYear === 'number' ? [{ id: item.id, taxYear: item.assignment.taxYear }] : [])),
  }
}

/** One page of `items` as the server serves it: newest first as given, `limit`, an opaque `cursor`, the `ordner` filter. */
export function receiptPage(items: readonly Partial<ReceiptResponseDto>[], query: { readonly limit?: number; readonly cursor?: string | null; readonly ordner?: ReceiptFolder | null } = {}): ReceiptPageResponseDto {
  const limit = query.limit ?? 30
  const inFolder = query.ordner ? items.filter((item) => receiptFolderOfKind(item.kind ?? null) === query.ordner) : [...items]
  const start = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) : 0
  const page = inFolder.slice(start, start + limit)
  const next = start + limit
  return { items: page as ReceiptResponseDto[], nextCursor: next < inFolder.length ? Buffer.from(String(next)).toString('base64url') : null, counts: receiptCounts(items) }
}

/** An msw handler for `GET /v1/belege` over a fixed list of Belege; reads `limit`, `cursor` and `ordner` like the API. */
export function receiptInboxHandler(items: readonly Partial<ReceiptResponseDto>[] | (() => readonly Partial<ReceiptResponseDto>[])) {
  return http.get('*/v1/belege', ({ request }) => {
    const url = new URL(request.url)
    const limit = url.searchParams.get('limit')
    return HttpResponse.json(
      receiptPage(typeof items === 'function' ? items() : items, { ...(limit ? { limit: Number(limit) } : {}), cursor: url.searchParams.get('cursor'), ordner: url.searchParams.get('ordner') as ReceiptFolder | null }),
      { status: 200 },
    )
  })
}
