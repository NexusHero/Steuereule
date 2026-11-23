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
  const ownLastName = profile.data?.status === 200 ? (profile.data.data.lastName ?? '') : ''
  const ownAddress = masterData.data?.status === 200 ? masterData.data.data : null
  const addressState = ownAddress?.plz ? stateForAddress(ownAddress.plz, ownAddress.wohnort ?? '') : null
  const married = masterData.data?.status === 200 && masterData.data.data.familienstand === 'verheiratet'
  const link = useLinkControllerGet(taxYear, { query: { enabled: married, retry: false } })
  const partnerName = link.data?.status === 200 ? link.data.data.personB?.firstName?.trim() || undefined : undefined
  const [householdQuestions, setHouseholdQuestions] = useState(false)
  const { track, flushThen, saveFailed } = usePendingMutations()

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
      return created.status === 201 ? (created.data.kinder as readonly ChildItem[]) : undefined
    })()
    track(task)
    return task
  }

  const onSaveChild = (id: string, data: ChildInput) => {
    const task = (async () => {
      const updated = await watchSaveResult(updateChild.mutateAsync({ jahr: taxYear, id, data }))
      await invalidate()
      return updated.status === 200 ? (updated.data.kinder as readonly ChildItem[]) : undefined
    })()
    track(task)
    return task
  }

  const onDeleteChild = (id: string) => {
    const task = (async () => {
      await watchSaveResult(deleteChild.mutateAsync({ jahr: taxYear, id }))
      await invalidate()
    })()
    track(task)
    return task
  }

  return {
    query,
    ownLastName,
    addressState,
    married,
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
