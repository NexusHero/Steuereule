import { useState } from 'react'
import { useBusinessControllerProfile, useBusinessControllerSaveProfile, type BusinessProfileInputDto } from '@steuereule/api-client'
import { personParams, type ApiProblem, type Person } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'

/** The profile and a way to change it: nested objects are replaced whole by the API, so callers send complete ones. */
export function useProfileEditor(taxYear: number, person: Person) {
  const params = personParams(person)
  const query = useBusinessControllerProfile(taxYear, params)
  const mutation = useBusinessControllerSaveProfile()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  async function save(patch: BusinessProfileInputDto): Promise<boolean> {
    setProblem(null)
    const result = await attempt(() => mutation.mutateAsync({ jahr: taxYear, data: patch, ...(params ? { params } : {}) }))
    if (result.ok) refresh()
    else setProblem(result.problem)
    return result.ok
  }

  return { query, profile: query.data?.status === 200 ? query.data.data : null, loadProblem: queryProblem(query), save, problem }
}
