import type { QueryClient } from '@tanstack/react-query'
import {
  getAdvisorControllerConnectionQueryKey,
  getAdvisorControllerGetSessionQueryKey,
  getAssessmentControllerGetQueryKey,
  getCapitalControllerGetQueryKey,
  getChSalaryCertificateControllerGetQueryKey,
  getChildrenControllerListQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getCommuteControllerGetQueryKey,
  getConfirmationControllerGetQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getLstbControllerGetLstbQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  getPensionControllerGetQueryKey,
  getPrintoutControllerCheckQueryKey,
  getRentalControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
} from '@steuereule/api-client'

/** After a draft was applied or undone every read of the tax year may be stale. */
export async function invalidateAllTaxQueries(queryClient: QueryClient, taxYear: number): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
    // A turn just found out whether the model answers (#488).
    queryClient.invalidateQueries({ queryKey: getAdvisorControllerConnectionQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getCommuteControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getChSalaryCertificateControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getCapitalControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getRentalControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getChildrenControllerListQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getPensionControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getAssessmentControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getConfirmationControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getPrintoutControllerCheckQueryKey(taxYear) }),
  ])
}
