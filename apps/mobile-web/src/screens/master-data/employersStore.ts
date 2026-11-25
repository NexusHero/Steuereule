import { useKnownEmployersControllerList } from '@steuereule/api-client'

/** An employer the household has recorded on a Swiss salary certificate, offered for the next one. */
export interface KnownEmployer {
  readonly id: string
  readonly name: string
  readonly strasse: string
  readonly plzOrt: string
}

function idOf(name: string): string {
  return `emp-${name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '')}`
}

/**
 * The employers recorded on the household's Swiss salary certificates, all years, both persons
 * (Echtdatentest 18.11.2026): a fresh account knows none — there is no fixed start list any more, and
 * nothing is kept on its own; an employer is entered where it belongs, on the certificate.
 */
export function useKnownEmployers(enabled = true): readonly KnownEmployer[] {
  const query = useKnownEmployersControllerList({ query: { enabled, retry: false } })
  // Suggestions only: a failed load offers none, it changes nothing that is stored.
  const list = query.data?.data ?? []
  return list.map((employer) => ({ id: idOf(employer.name), name: employer.name, strasse: employer.strasse, plzOrt: employer.plzOrt }))
}
