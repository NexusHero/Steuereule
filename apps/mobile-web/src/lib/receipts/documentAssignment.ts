import {
  childrenControllerCreate,
  linkControllerGet,
  linkControllerSet,
  linkControllerUpdatePersonB,
  profileControllerGetProfile,
  profileControllerPutProfile,
  apiErrorStatus,
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
  readonly getLink: typeof linkControllerGet
  readonly setLink: typeof linkControllerSet
  readonly updatePersonB: typeof linkControllerUpdatePersonB
  readonly createChild: typeof childrenControllerCreate
}

const DEFAULT_DEPS: CreateHolderDeps = {
  getLink: linkControllerGet,
  setLink: linkControllerSet,
  updatePersonB: linkControllerUpdatePersonB,
  createChild: childrenControllerCreate,
}

/**
 * Creates the person a document names, by the user's click (ADR-0092 §3) — through the same endpoints as
 * the masks, so no consent for the owl is needed. Returns the new holder reference, or null on failure.
 * Every endpoint rejects on a failure status (WEB-28), so one catch covers them.
 */
export async function createHolderFromDocument(
  taxYear: number,
  role: 'B' | 'kind',
  details: NewHolderDetails,
  deps: Partial<CreateHolderDeps> = {},
): Promise<string | null> {
  const api = { ...DEFAULT_DEPS, ...deps }
  const taxId = details.taxId.replace(/\s/g, '')
  if (role === 'B') return createPersonB(api, taxYear, details, taxId)
  try {
    const res = await api.createChild(taxYear, {
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      geburtsdatum: details.birthDate,
      ...(taxId ? { taxId } : {}),
    })
    const kinder = (res.data as { kinder?: { id: string; firstName: string; geburtsdatum: string }[] }).kinder ?? []
    const child = kinder.filter((k) => k.firstName === details.firstName.trim() && k.geburtsdatum === details.birthDate).at(-1)
    return child ? `kind:${child.id}` : null
  } catch {
    return null
  }
}

/**
 * Person B needs the joint return. NR-10: when Person B then cannot be saved, the switch to „zusammen“ is
 * undone, so a failed „Person B anlegen“ leaves the year as it was (best effort — a failing undo is not
 * worse than before). A year that already was joint is not touched.
 */
async function createPersonB(api: CreateHolderDeps, taxYear: number, details: NewHolderDetails, taxId: string): Promise<string | null> {
  let switched = false
  try {
    // A year without a link answers 404; any other failure stops here, since an undo built on a guess
    // could switch a joint year to „einzel“.
    const link = await api.getLink(taxYear).catch((error: unknown) => {
      if (apiErrorStatus(error) === 404) return null
      throw error
    })
    if (link?.data.filingType !== 'zusammen') {
      await api.setLink(taxYear, { filingType: 'zusammen' })
      switched = true
    }
    await api.updatePersonB(taxYear, {
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      ...(details.birthDate ? { geburtsdatum: details.birthDate } : {}),
      ...(taxId ? { steuerId: taxId } : {}),
    })
    return 'B'
  } catch {
    if (switched) await api.setLink(taxYear, { filingType: 'einzel' }).catch(() => undefined)
    return null
  }
}

/** What „Ja, Name übernehmen“ did: wrote the name, left a name already there, or could not ask/write. */
export type TakeNameResult = 'taken' | 'kept' | 'failed'

/**
 * „Bist du …?“ — yes, and the name goes into the user's own empty profile (N1). WEB-32 / NR-02: only a profile
 * that loaded is looked at — a failed load writes nothing — and the PUT carries only the names, so the
 * stored Steuer-ID and Steuernummer stay (the server keeps an absent identifier).
 */
export async function takeNameIntoProfile(
  details: Pick<NewHolderDetails, 'firstName' | 'lastName'>,
  deps: { readonly get?: typeof profileControllerGetProfile; readonly put?: typeof profileControllerPutProfile } = {},
): Promise<TakeNameResult> {
  const get = deps.get ?? profileControllerGetProfile
  const put = deps.put ?? profileControllerPutProfile
  if (!details.firstName.trim() || !details.lastName.trim()) return 'kept'
  try {
    const current = await get()
    if (current.data.firstName) return 'kept'
    await put({ firstName: details.firstName.trim(), lastName: details.lastName.trim() })
    return 'taken'
  } catch {
    return 'failed'
  }
}
