// The spouse's first name for drafts the owl prepared for Person B (ADR-0073). Asked for only
// while such a draft is on screen, so a single person's chat makes no extra request.
import { useLinkControllerGet } from '@steuereule/api-client'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { hasPersonBDraft } from './owlDrafts'

export function usePartnerFirstName(taxYear: number, messages: readonly AdvisorChatMessageView[] | null | undefined): string | undefined {
  const link = useLinkControllerGet(taxYear, { query: { enabled: hasPersonBDraft(messages ?? undefined), retry: false } })
  return link.data?.status === 200 ? link.data.data.personB?.firstName?.trim() || undefined : undefined
}
