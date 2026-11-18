import {
  childrenControllerCreate,
  linkControllerSet,
  linkControllerUpdatePersonB,
  profileControllerGetProfile,
  profileControllerPutProfile,
} from '@steuereule/api-client'
import { isIsoDate, type PrintedPersonDetails } from '@steuereule/core'

/** A holder reference as a testID part: `A`, `B`, `kind-<id>` (no colon in a selector). */
export function holderTestId(holder: string): string {
  return holder.replace(':', '-')
}

/** The details the user confirms before a person is created from a document (ADR-0092 §3). */
export interface NewHolderDetails {
  readonly firstName: string
  readonly lastName: string
  /** ISO yyyy-mm-dd. */
  readonly birthDate: string
  readonly taxId: string
}

export function detailsFromDocument(printed: PrintedPersonDetails): NewHolderDetails {
  return { firstName: printed.firstName ?? '', lastName: printed.lastName ?? '', birthDate: printed.birthDate ?? '', taxId: printed.taxId ?? '' }
}

/** Whether the details are enough to create the person: names and a birth date (a child needs it). */
export function detailsComplete(details: NewHolderDetails): boolean {
  return details.firstName.trim() !== '' && details.lastName.trim() !== '' && isIsoDate(details.birthDate)
}

export interface CreateHolderDeps {
  readonly setLink: typeof linkControllerSet
  readonly updatePersonB: typeof linkControllerUpdatePersonB
  readonly createChild: typeof childrenControllerCreate
}

const DEFAULT_DEPS: CreateHolderDeps = { setLink: linkControllerSet, updatePersonB: linkControllerUpdatePersonB, createChild: childrenControllerCreate }

/**
 * Creates the person a document names, by the user's click (ADR-0092 §3) — through the same endpoints as
 * the masks, so no consent for the owl is needed. Returns the new holder reference, or null on failure.
 */
export async function createHolderFromDocument(
  taxYear: number,
  role: 'B' | 'kind',
  details: NewHolderDetails,
  deps: Partial<CreateHolderDeps> = {},
): Promise<string | null> {
  const api = { ...DEFAULT_DEPS, ...deps }
  const taxId = details.taxId.replace(/\s/g, '')
  try {
    if (role === 'B') {
      if ((await api.setLink(taxYear, { filingType: 'zusammen' })).status !== 200) return null
      const res = await api.updatePersonB(taxYear, {
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim(),
        ...(details.birthDate ? { geburtsdatum: details.birthDate } : {}),
        ...(taxId ? { steuerId: taxId } : {}),
      })
      return res.status === 200 ? 'B' : null
    }
    const res = await api.createChild(taxYear, {
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      geburtsdatum: details.birthDate,
      ...(taxId ? { taxId } : {}),
    })
    if (res.status !== 201) return null
    const kinder = (res.data as { kinder?: { id: string; firstName: string; geburtsdatum: string }[] }).kinder ?? []
    const child = kinder.filter((k) => k.firstName === details.firstName.trim() && k.geburtsdatum === details.birthDate).at(-1)
    return child ? `kind:${child.id}` : null
  } catch {
    return null
  }
}

/** „Bist du …?“ — yes, and the name goes into the user's own empty profile (N1). */
export async function takeNameIntoProfile(
  details: Pick<NewHolderDetails, 'firstName' | 'lastName'>,
  deps: { readonly get?: typeof profileControllerGetProfile; readonly put?: typeof profileControllerPutProfile } = {},
): Promise<boolean> {
  const get = deps.get ?? profileControllerGetProfile
  const put = deps.put ?? profileControllerPutProfile
  if (!details.firstName.trim() || !details.lastName.trim()) return false
  try {
    const current = await get()
    const profile = current.status === 200 ? (current.data as { firstName?: string | null; steuerId?: string | null; steuernummer?: string | null }) : null
    if (profile?.firstName) return false
    const res = await put({
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      ...(profile?.steuerId ? { steuerId: profile.steuerId } : {}),
      ...(profile?.steuernummer ? { steuernummer: profile.steuernummer } : {}),
    })
    return res.status === 200
  } catch {
    return false
  }
}
