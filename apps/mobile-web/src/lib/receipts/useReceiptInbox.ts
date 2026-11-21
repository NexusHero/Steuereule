import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { getReceiptControllerListQueryKey, receiptControllerList, type ReceiptControllerListOrdner, type ReceiptPageResponseDto } from '@steuereule/api-client'

export const RECEIPT_PAGE_SIZE = 30

export interface ReceiptInboxOptions {
  /** Only the Belege of this folder; the counts of the page still cover all of them. */
  readonly folder?: ReceiptControllerListOrdner | undefined
  readonly limit?: number
  readonly enabled?: boolean
}

/**
 * The Belege inbox in pages, newest first. The key starts with the list's own key, so every
 * `invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })` of an upload, a reassignment or
 * a delete refreshes the pages loaded so far.
 */
export function useReceiptInbox({ folder, limit = RECEIPT_PAGE_SIZE, enabled = true }: ReceiptInboxOptions = {}) {
  return useInfiniteQuery({
    queryKey: [...getReceiptControllerListQueryKey(), 'pages', folder ?? 'alle', limit] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ReceiptPageResponseDto> => {
      const response = await receiptControllerList({ limit, ...(pageParam !== undefined ? { cursor: pageParam } : {}), ...(folder !== undefined ? { ordner: folder } : {}) })
      if (response.status !== 200) throw new Error(`Belege konnten nicht geladen werden (${response.status}).`)
      return response.data
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled,
  })
}
