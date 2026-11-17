// Whose drafts the cards show, in a joint return (ADR-0073): the spouse's first name for drafts for
// Person B, and the user's own first name for the user's drafts on a mask of one spouse, so a card
// that would write the spouse's figure into the user's field shows it. Asked for only while such a
// draft is on screen, so a chat without one makes no extra request.
import { useLinkControllerGet, useProfileControllerGetProfile } from '@steuereule/api-client'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { hasPersonScreenDraft } from './owlDrafts'

export interface DraftOwners {
  readonly partnerName: string | undefined
  readonly ownName: string | undefined
  readonly jointReturn: boolean
}

export function useDraftOwners(taxYear: number, messages: readonly AdvisorChatMessageView[] | null | undefined): DraftOwners {
  const enabled = hasPersonScreenDraft(messages ?? undefined)
  const link = useLinkControllerGet(taxYear, { query: { enabled, retry: false } })
  const linkData = link.data?.status === 200 ? link.data.data : undefined
  const jointReturn = linkData?.filingType === 'zusammen' && linkData.personB != null
  const profile = useProfileControllerGetProfile({ query: { enabled: enabled && jointReturn, retry: false } })
  return {
    partnerName: linkData?.personB?.firstName?.trim() || undefined,
    ownName: profile.data?.status === 200 ? profile.data.data.firstName?.trim() || undefined : undefined,
    jointReturn,
  }
}
