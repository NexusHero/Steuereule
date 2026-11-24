import { useState } from 'react'
import { useBusinessControllerProfile, useBusinessControllerSaveProfile, type BusinessProfileInputDto } from '@steuereule/api-client'
import { personParams, type ApiProblem, type Person } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'

/**
 * The profile and a way to change it. vatPeriodFacts, lossFacts and tradeTaxInputs merge key by key on the API
 * (send only the key that changed, null removes it); lists and the other objects are replaced whole. `profile`
 * is null until the read succeeded: no page builds a save from data that did not load (WEB-28).
 */
export function useProfileEditor(taxYear: number, person: Person, business = 1) {
  const params = personParams(person, business)
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

  const profile = query.isSuccess ? query.data.data : null
  // NC-15: a page offers no second change of a whole-replaced list while the first is on its way.
  return { query, profile, loadProblem: queryProblem(query), save, problem, saving: mutation.isPending }
}
