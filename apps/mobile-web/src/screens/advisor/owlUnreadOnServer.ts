import { useAdvisorControllerListConversations } from '@steuereule/api-client'

/**
 * Whether a conversation of the year holds an answer the user has not seen: kept by the server, so it
 * is the same after a reload and on another device. Asked only for a signed-in account (a guest has no
 * owl), and again whenever the window comes back into focus.
 */
export function useOwlUnreadOnServer(taxYear: number, signedIn: boolean): boolean {
  const query = useAdvisorControllerListConversations(taxYear, { query: { enabled: signedIn, retry: false, staleTime: 30_000, refetchOnWindowFocus: true } })
  // A list that did not load marks nothing: no mark is claimed that nobody checked.
  return signedIn && (query.data?.data.some((conversation) => conversation.unread) ?? false)
}
