// The child form's state: the list as shown, the fields being typed, and save and delete.
import { useEffect, useRef, useState } from 'react'
import { isoToGerman } from '../master-data/masterDataMapping'
import { calculateChildrenStatus, type ChildRelationship, type GermanState, type OtherParentStatus } from '@steuereule/core'
import { type ChildInput, type ChildItem } from './childrenModel'
import { childStatusInputs, hasFurtherDetails, officeSuggestionsFor, typedOfficeOf } from './childrenDerive'
import { childFormError, childPayload, otherParentKnown } from './childPayload'

export interface ChildFormOptions {
  readonly taxYear: number
  readonly initialKinder: readonly ChildItem[]
  readonly onAddChild?: ((kind: ChildInput) => Promise<readonly ChildItem[] | void> | void) | undefined
  readonly onSaveChild?: ((id: string, kind: ChildInput) => Promise<readonly ChildItem[] | void> | void) | undefined
  readonly onDeleteChild?: ((id: string) => Promise<void> | void) | undefined
  readonly married: boolean
  readonly suggestedLastName: string
  readonly addressState: GermanState | null
}

export function useChildForm({ taxYear, initialKinder, onAddChild, onSaveChild, onDeleteChild, married, suggestedLastName, addressState }: ChildFormOptions) {
  const [kinder, setKinder] = useState<readonly ChildItem[]>(initialKinder)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState(suggestedLastName)
  /** Which sibling the form was filled from, to say so until the user saves. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)
  const [geburtsdatum, setBirthDate] = useState('')
  const [taxId, setTaxId] = useState('')
  const [childBenefit, setChildBenefit] = useState('')
  const [swissAllowance, setSwissAllowance] = useState('')
  const [swissPayer, setSwissPayer] = useState<'A' | 'B' | null>(null)
  const [swissDerived, setSwissDerived] = useState<string | null>(null)
  const [kvBasis, setKvBasis] = useState('')
  const [pv, setPv] = useState('')
  const [healthAbroad, setHealthAbroad] = useState(false)
  const [childcare, setChildcare] = useState('')
  const [childcareProvider, setChildcareProvider] = useState('')
  /** The provider text hit the width of the form line: typed one character too many, or a longer text was cut. */
  const [providerFull, setProviderFull] = useState<'voll' | 'gekuerzt' | null>(null)
  const [saving, setSaving] = useState(false)
  /** Set the moment a save starts: `saving` is state and reaches this closure only after a render, so two taps dispatched before it would both save. */
  const saveInFlight = useRef(false)
  const [saveError, setSaveError] = useState<'pflicht' | 'datum' | 'server' | null>(null)
  /** The child the last save stored, named where the form was. */
  const [savedName, setSavedName] = useState<string | null>(null)
  const [childcareFrom, setChildcareFrom] = useState('')
  const [childcareTo, setChildcareTo] = useState('')
  const [relationship, setRelationship] = useState<ChildRelationship | null>(null)
  const [relationshipB, setRelationshipB] = useState<ChildRelationship | null>(married ? '1' : null)
  const [familyBenefitsOffice, setFamilyBenefitsOffice] = useState('')
  const [inland, setInland] = useState<boolean | null>(null)
  const [ae, setAe] = useState<OtherParentStatus | null>(null)
  const [opName, setOpName] = useState('')
  const [opBirthDate, setOpBirthDate] = useState('')
  const [opAddress, setOpAddress] = useState('')
  const [opKind, setOpKind] = useState<'1' | '2' | null>(null)
  const [opDiedOn, setOpDiedOn] = useState('')
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [childBenefitToMe, setChildBenefitToMe] = useState<boolean | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  // Married is known only once the master data has loaded: a new form then starts at the couple's
  // joint child too, not at „Keines“ (UX review H3, found in the browser retest).
  useEffect(() => {
    if (married && edited === null) setRelationshipB((current) => current ?? '1')
    // Only the moment the household becomes known matters; later choices are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [married])
  const [formOpen, setFormOpen] = useState(initialKinder.length === 0)
  /** Short form first: the optional amounts stay folded until asked for, or until a child already has one. */
  const [moreOpen, setMoreOpen] = useState(false)

  const foldStatus = calculateChildrenStatus(childStatusInputs(kinder), taxYear)

  function fillForm(k: ChildItem | null) {
    setFirstName(k?.firstName ?? '')
    setLastName(k?.lastName ?? suggestedLastName)
    setCopiedFrom(null)
    setBirthDate(isoToGerman(k?.geburtsdatum ?? null))
    setTaxId(k?.taxId ?? '')
    setChildBenefit(k?.childBenefitClaimEur ?? '')
    // A share derived from a parent's Lohnausweis is shown as a hint, not stored as the child's own amount.
    setSwissAllowance(k?.swissFamilyAllowanceDerived ? '' : (k?.swissFamilyAllowanceEur ?? ''))
    setSwissDerived(k?.swissFamilyAllowanceDerived ? (k.swissFamilyAllowanceEur ?? null) : null)
    setSwissPayer(k?.swissFamilyAllowancePayer ?? null)
    setKvBasis(k?.healthBasicEur ?? '')
    setPv(k?.careEur ?? '')
    setHealthAbroad(k?.healthInsuranceAbroad === true)
    setChildcare(k?.childcareEur ?? '')
    setChildcareProvider(k?.childcareProvider ?? '')
    setChildcareFrom(k?.childcareFrom ?? '')
    setChildcareTo(k?.childcareTo ?? '')
    setRelationship(k?.kinship ?? null)
    // A couple's new child is usually theirs together (UX review H3): pre-select it, never „Keines“.
    setRelationshipB(k ? (k.kinshipB ?? null) : married ? '1' : null)
    setFamilyBenefitsOffice(k?.familyBenefitsOffice ?? '')
    setInland(k?.domesticResidenceAllYear ?? null)
    setAe(k?.otherParent ?? null)
    setOpName(k?.otherParentName ?? '')
    setOpBirthDate(isoToGerman(k?.otherParentBirthDate ?? null))
    setOpAddress(k?.otherParentAddress ?? '')
    setOpKind(k?.otherParentKind ?? null)
    setOpDiedOn(isoToGerman(k?.otherParentDiedOn ?? null))
    setRegistered(k?.registeredWithMeAllYear ?? null)
    setChildBenefitToMe(k?.childBenefitToMeAllYear ?? null)
    setEdited(k?.id ?? null)
    setMoreOpen(hasFurtherDetails(k, married))
  }

  const opKnown = otherParentKnown(ae)

  const typedOffice = typedOfficeOf(familyBenefitsOffice)
  const officeSuggestions = officeSuggestionsFor(typedOffice, addressState)

  // The profile may arrive after the form is open: fill the still empty last name of a new child then.
  useEffect(() => {
    if (edited === null && suggestedLastName !== '') setLastName((current) => (current === '' ? suggestedLastName : current))
  }, [suggestedLastName, edited])

  /** Siblings share what rarely differs: name, Familienkasse, relationships, residence and the other parent. */
  function copyFromSibling(k: ChildItem) {
    setLastName(k.lastName)
    setRelationship(k.kinship ?? null)
    setRelationshipB(k.kinshipB ?? null)
    setFamilyBenefitsOffice(k.familyBenefitsOffice ?? '')
    setInland(k.domesticResidenceAllYear ?? null)
    setAe(k.otherParent ?? null)
    setOpName(k.otherParentName ?? '')
    setOpBirthDate(isoToGerman(k.otherParentBirthDate ?? null))
    setOpAddress(k.otherParentAddress ?? '')
    setOpKind(k.otherParentKind ?? null)
    setOpDiedOn(isoToGerman(k.otherParentDiedOn ?? null))
    setRegistered(k.registeredWithMeAllYear ?? null)
    setChildBenefitToMe(k.childBenefitToMeAllYear ?? null)
    setCopiedFrom(k.firstName)
  }

  async function handleSave() {
    if (saveInFlight.current) return
    setSavedName(null)
    // A press that does nothing reads like a broken button (real-data run 4): say what is missing.
    const formError = childFormError({ firstName, lastName, geburtsdatum })
    if (formError !== null) {
      setSaveError(formError)
      return
    }
    const payload: ChildInput = childPayload({
      firstName,
      lastName,
      geburtsdatum,
      taxId,
      childBenefit,
      relationship,
      relationshipB,
      familyBenefitsOffice,
      inland,
      ae,
      opName,
      opBirthDate,
      opAddress,
      opKind,
      opDiedOn,
      registered,
      childBenefitToMe,
      kvBasis,
      pv,
      healthAbroad,
      swissAllowance,
      swissPayer,
      childcare,
      childcareProvider,
      childcareFrom,
      childcareTo,
    })
    saveInFlight.current = true
    setSaving(true)
    setSaveError(null)
    let stored: readonly ChildItem[] | void = undefined
    try {
      if (edited) {
        if (onSaveChild) stored = await onSaveChild(edited, payload)
      } else if (onAddChild) {
        stored = await onAddChild(payload)
      }
    } catch {
      // The save did not reach the server or was refused: keep the form open with the user's input, and say so here.
      setSaveError('server')
      return
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
    setSavedName(payload.firstName)
    if (stored) {
      // The server's list: a new child has its own id, so editing it right away updates that child.
      setKinder(stored)
    } else if (edited) {
      setKinder(kinder.map((k) => (k.id === edited ? { ...k, ...payload } : k)))
    } else {
      setKinder([...kinder, { id: `local-${Date.now()}`, sequenceNumber: kinder.length + 1, ...payload }])
    }
    fillForm(null)
    setFormOpen(false)
  }

  async function handleDelete(id: string) {
    try {
      if (onDeleteChild) await onDeleteChild(id)
    } catch {
      return
    }
    setKinder(kinder.filter((k) => k.id !== id))
  }

  return {
    kinder,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    copiedFrom,
    geburtsdatum,
    setBirthDate,
    taxId,
    setTaxId,
    childBenefit,
    setChildBenefit,
    swissAllowance,
    setSwissAllowance,
    swissPayer,
    setSwissPayer,
    swissDerived,
    kvBasis,
    setKvBasis,
    pv,
    setPv,
    healthAbroad,
    setHealthAbroad,
    childcare,
    setChildcare,
    childcareProvider,
    setChildcareProvider,
    providerFull,
    setProviderFull,
    saving,
    saveError,
    savedName,
    childcareFrom,
    setChildcareFrom,
    childcareTo,
    setChildcareTo,
    relationship,
    setRelationship,
    relationshipB,
    setRelationshipB,
    familyBenefitsOffice,
    setFamilyBenefitsOffice,
    inland,
    setInland,
    ae,
    setAe,
    opName,
    setOpName,
    opBirthDate,
    setOpBirthDate,
    opAddress,
    setOpAddress,
    opKind,
    setOpKind,
    opDiedOn,
    setOpDiedOn,
    registered,
    setRegistered,
    childBenefitToMe,
    setChildBenefitToMe,
    edited,
    formOpen,
    setFormOpen,
    moreOpen,
    setMoreOpen,
    foldStatus,
    opKnown,
    typedOffice,
    officeSuggestions,
    fillForm,
    copyFromSibling,
    handleSave,
    handleDelete,
  }
}

/** Everything the form sections read and set. */
export type ChildForm = ReturnType<typeof useChildForm>
