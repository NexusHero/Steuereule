import { useQueryClient } from '@tanstack/react-query'
import type { StromPost } from '@steuereule/core'
import {
  useInterviewControllerPostAnswer,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getTaxEstimateControllerGetQueryKey,
} from '@steuereule/api-client'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'

export type SaveResult = 'ok' | 'conflict' | 'network'

/**
 * Sends a Strom page's answers one after another — each only after the one it follows, as the
 * server admits them — through the same endpoint the catalogues and the owl's interview drafts use.
 */
export function useStromSave(taxYear: number): { readonly save: (posts: readonly StromPost[]) => Promise<SaveResult>; readonly saving: boolean } {
  const queryClient = useQueryClient()
  const postAnswer = useInterviewControllerPostAnswer()

  async function save(posts: readonly StromPost[]): Promise<SaveResult> {
    try {
      for (const post of posts) {
        const response = await postAnswer.mutateAsync({ jahr: taxYear, data: { questionId: post.questionId, value: post.value } })
        if (response.status !== 200) {
          triggerSaveErrorHaptic()
          await queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) })
          return 'conflict'
        }
      }
    } catch {
      triggerSaveErrorHaptic()
      return 'network'
    }
    if (posts.length > 0) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
        queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
        queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
      ])
    }
    return 'ok'
  }

  return { save, saving: postAnswer.isPending }
}
