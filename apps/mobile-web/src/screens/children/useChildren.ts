// The children mask's server side: the list, the household facts around it, and the writes.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getChildrenControllerListQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useChildrenControllerCreate,
  useChildrenControllerDelete,
  useChildrenControllerList,
  useProfileControllerGetProfile,
  useChildrenControllerUpdate,
  useMasterDataControllerRead,
  useLinkControllerGet,
} from '@steuereule/api-client'
import { stateForAddress } from '../shared/postalCodePrefill'
import { usePendingMutations } from '../shared/usePendingMutations'
import { useTrackField } from '../shared/useTrackField'
import { watchSaveResult } from '../shared/saveFeedback'
import { type ChildInput, type ChildItem } from './childrenModel'

export function useChildren(taxYear: number) {
  const queryClient = useQueryClient()
  const query = useChildrenControllerList(taxYear)
  const createChild = useChildrenControllerCreate()
  const updateChild = useChildrenControllerUpdate()
  const deleteChild = useChildrenControllerDelete()
  const masterData = useMasterDataControllerRead()
  const profile = useProfileControllerGetProfile()
  // Suggestions only (the last name of a new child, the Familienkasse): a failed read suggests nothing.
  const ownLastName = profile.data?.data.lastName ?? ''
  const ownAddress = masterData.data?.data ?? null
  const addressState = ownAddress?.plz ? stateForAddress(ownAddress.plz, ownAddress.wohnort ?? '') : null
  const married = masterData.data?.data.familienstand === 'verheiratet'
  // NM-15: without the marital status a married user would be asked the single-parent questions.
  const maritalStatusFailed = masterData.isError
  const link = useLinkControllerGet(taxYear, { query: { enabled: married, retry: false } })
  const partnerName = link.data?.data.personB?.firstName?.trim() || undefined
  const [householdQuestions, setHouseholdQuestions] = useState(false)
  const { track, flushThen, saveFailed, clearSaveError } = usePendingMutations()
  // WEB-12: one key per child (a new child is one too): a failed save or delete holds the leave once, and goes
  // once the same child was saved or deleted after all; a failure of another child still stands.
  const trackChild = useTrackField(track, clearSaveError)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getChildrenControllerListQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
    ])
  }

  const onAddChild = (data: ChildInput) => {
    const task = (async () => {
      const created = await watchSaveResult(createChild.mutateAsync({ jahr: taxYear, data }))
      await invalidate()
      return created.data.kinder as readonly ChildItem[]
    })()
    trackChild('child:new', task)
    return task
  }

  const onSaveChild = (id: string, data: ChildInput) => {
    const task = (async () => {
      const updated = await watchSaveResult(updateChild.mutateAsync({ jahr: taxYear, id, data }))
      await invalidate()
      return updated.data.kinder as readonly ChildItem[]
    })()
    trackChild(`child:${id}`, task)
    return task
  }

  const onDeleteChild = (id: string) => {
    const task = (async () => {
      await watchSaveResult(deleteChild.mutateAsync({ jahr: taxYear, id }))
      await invalidate()
    })()
    trackChild(`child:${id}`, task)
    return task
  }

  return {
    query,
    ownLastName,
    addressState,
    married,
    maritalStatusFailed,
    masterData,
    partnerName,
    householdQuestions,
    setHouseholdQuestions,
    flushThen,
    saveFailed,
    invalidate,
    onAddChild,
    onSaveChild,
    onDeleteChild,
  }
}
