import { useEffect, useState, type ReactNode } from 'react'
import { HouseholdChildrenSection } from './HouseholdChildrenSection'
import { AddressSearch } from '../shared/AddressSearch'
import { todayIso } from '../shared/today'
import { stateForAddress } from '../shared/postalCodePrefill'
import { TaxIdHint } from '../shared/TaxIdHint'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { germanToIso, isoToGerman } from '../master-data/masterDataMapping'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, DateInput, Feld, Input, useBreakpoint, useTheme } from '@steuereule/ui'
import {
  claimMonths,
  formatEuro,
  monthlyChildBenefitClaim,
  calculateChildrenStatus,
  OTHER_CHILD_RELATIONSHIPS,
  OTHER_PARENT_STATUSES,
  CHILD_RELATIONSHIPS,
  FAMILY_BENEFITS_OFFICES,
  familyBenefitsOfficesForState,
  type GermanState,
  type OtherParentStatus,
  type ChildRelationship,
} from '@steuereule/core'
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
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'
import { makeStyles } from './ChildrenScreen.styles'

export interface ChildItem {
  id: string
  sequenceNumber: number
  firstName: string
  lastName: string
  geburtsdatum: string
  taxId?: string | null
  childBenefitClaimEur?: string | null
  kinship?: ChildRelationship | null
  kinshipB?: ChildRelationship | null
  familyBenefitsOffice?: string | null
  domesticResidenceAllYear?: boolean | null
  otherParent?: OtherParentStatus | null
  otherParentName?: string | null
  otherParentBirthDate?: string | null
  otherParentAddress?: string | null
  otherParentKind?: '1' | '2' | null
  otherParentDiedOn?: string | null
  registeredWithMeAllYear?: boolean | null
  childBenefitToMeAllYear?: boolean | null
  healthBasicEur?: string | null
  careEur?: string | null
  swissFamilyAllowanceEur?: string | null
  differentialChildBenefitEur?: string | null
  totalClaimEur?: string | null
}

/** What the form writes: the identity plus the Anlage-Kind facts. */
export interface ChildInput {
  firstName: string
  lastName: string
  geburtsdatum: string
  taxId?: string
  childBenefitClaimEur?: string
  kinship: ChildRelationship | null
  kinshipB: ChildRelationship | null
  familyBenefitsOffice: string | null
  domesticResidenceAllYear: boolean | null
  otherParent: OtherParentStatus | null
  otherParentName: string | null
  otherParentBirthDate: string | null
  otherParentAddress: string | null
  otherParentKind: '1' | '2' | null
  otherParentDiedOn: string | null
  registeredWithMeAllYear: boolean | null
  childBenefitToMeAllYear: boolean | null
  healthBasicEur: string | null
  careEur: string | null
  swissFamilyAllowanceEur?: string | null
}

const OTHER_PARENT_LABEL: Record<OtherParentStatus, string> = {
  Inland: 'Lebt in Deutschland',
  Ausland: 'Lebt im Ausland',
  Verstorben: 'Ist verstorben',
  Unbekannt: 'Nicht zu ermitteln',
}

const KINSHIP_LABEL: Record<ChildRelationship, string> = {
  '1': 'Leibliches Kind / Adoptivkind',
  '2': 'Pflegekind',
  '3': 'Enkelkind / Stiefkind',
}

function missingForPrintout(k: ChildItem): boolean {
  return !k.taxId || !k.kinship || !k.familyBenefitsOffice || k.domesticResidenceAllYear == null
}

export interface ChildrenScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialKinder?: readonly ChildItem[] | undefined
  readonly onAddChild?: ((kind: ChildInput) => Promise<void> | void) | undefined
  readonly onSaveChild?: ((id: string, kind: ChildInput) => Promise<void> | void) | undefined
  readonly onDeleteChild?: ((id: string) => Promise<void> | void) | undefined
  readonly onSingleParentQuestions?: (() => void) | undefined
  /** Married people cannot claim the Entlastungsbetrag für Alleinerziehende (§ 24b EStG), so its questions stay hidden. */
  readonly married?: boolean | undefined
  /** The household at account level (#452): last year's children to take over, duplicates, leaving. */
  readonly householdSlot?: ReactNode
  /** The user's own last name: offered for a new child, marked as a suggestion, never for an existing one. */
  readonly suggestedLastName?: string | undefined
  /** Bundesland of the user's own address: its Familienkassen are suggested first. */
  readonly addressState?: GermanState | null | undefined
}

export function ChildrenScreen(props: ChildrenScreenProps) {
  if (props.initialKinder !== undefined) {
    return <KinderScreenView {...props} initialKinder={props.initialKinder} />
  }
  return <ConnectedKinderScreen {...props} />
}

function ConnectedKinderScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: ChildrenScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
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
  const [householdQuestions, setHouseholdQuestions] = useState(false)
  const { track, flushThen, saveFailed } = usePendingMutations()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('kinder.loading', 'Kinder werden geladen …')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('kinder.loadError.heading', 'Das hat nicht geklappt.')}
        message={tr('kinder.loadError.message', 'Deine Kinder konnten nicht geladen werden.')}
        retryLabel={tr('kinder.loadError.retry', 'Noch mal versuchen')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getChildrenControllerListQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
    ])
  }

  if (householdQuestions) {
    return (
      <CatalogScreen
        entry="alleinerziehend"
        taxYear={taxYear}
        onDone={() => setHouseholdQuestions(false)}
        onBack={() => setHouseholdQuestions(false)}
      />
    )
  }

  return (
    <>
    <SaveFailedNotice visible={saveFailed} />
    <KinderScreenView
      onDone={() => flushThen(onDone)}
      {...(onBack ? { onBack: () => flushThen(onBack) } : {})}
      taxYear={taxYear}
      initialKinder={query.data.data.kinder}
      onAddChild={(data) => {
        const task = (async () => {
          await watchSaveResult(createChild.mutateAsync({ jahr: taxYear, data }))
          await invalidate()
        })()
        track(task)
        return task
      }}
      onSaveChild={(id, data) => {
        const task = (async () => {
          await watchSaveResult(updateChild.mutateAsync({ jahr: taxYear, id, data }))
          await invalidate()
        })()
        track(task)
        return task
      }}
      onDeleteChild={(id) => {
        const task = (async () => {
          await watchSaveResult(deleteChild.mutateAsync({ jahr: taxYear, id }))
          await invalidate()
        })()
        track(task)
        return task
      }}
      onSingleParentQuestions={() => setHouseholdQuestions(true)}
      married={married}
      suggestedLastName={ownLastName}
      addressState={addressState}
      householdSlot={<HouseholdChildrenSection taxYear={taxYear} onChanged={invalidate} />}
    />
    </>
  )
}

function KinderScreenView({
  householdSlot = null,
  onDone = () => {},
  onBack,
  taxYear = CURRENT_TAX_YEAR,
  initialKinder = [],
  onAddChild,
  onSaveChild,
  onDeleteChild,
  onSingleParentQuestions,
  married = false,
  suggestedLastName = '',
  addressState = null,
}: ChildrenScreenProps & { readonly initialKinder: readonly ChildItem[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const [kinder, setKinder] = useState<readonly ChildItem[]>(initialKinder)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState(suggestedLastName)
  /** Which sibling the form was filled from, to say so until the user saves. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)
  const [geburtsdatum, setBirthDate] = useState('')
  const [taxId, setTaxId] = useState('')
  const [childBenefit, setChildBenefit] = useState('')
  const [swissAllowance, setSwissAllowance] = useState('')
  const [kvBasis, setKvBasis] = useState('')
  const [pv, setPv] = useState('')
  const [relationship, setRelationship] = useState<ChildRelationship | null>(null)
  const [relationshipB, setRelationshipB] = useState<ChildRelationship | null>(null)
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
  const [formOpen, setFormOpen] = useState(initialKinder.length === 0)
  /** Short form first: the optional amounts stay folded until asked for, or until a child already has one. */
  const [moreOpen, setMoreOpen] = useState(false)

  const foldStatus = calculateChildrenStatus(
    kinder.map((k) => ({
      id: k.id,
      firstName: k.firstName,
      lastName: k.lastName,
      birthDate: k.geburtsdatum,
      taxId: k.taxId ?? null,
      childBenefit: k.childBenefitClaimEur ? Number(k.childBenefitClaimEur) : null,
      swissFamilyAllowanceEur: k.swissFamilyAllowanceEur ? Number(k.swissFamilyAllowanceEur) : null,
    })),
    taxYear,
  )

  function fillForm(k: ChildItem | null) {
    setFirstName(k?.firstName ?? '')
    setLastName(k?.lastName ?? suggestedLastName)
    setCopiedFrom(null)
    setBirthDate(isoToGerman(k?.geburtsdatum ?? null))
    setTaxId(k?.taxId ?? '')
    setChildBenefit(k?.childBenefitClaimEur ?? '')
    setSwissAllowance(k?.swissFamilyAllowanceEur ?? '')
    setKvBasis(k?.healthBasicEur ?? '')
    setPv(k?.careEur ?? '')
    setRelationship(k?.kinship ?? null)
    setRelationshipB(k?.kinshipB ?? null)
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
    setMoreOpen(
      Boolean(k && (k.childBenefitClaimEur || k.swissFamilyAllowanceEur || k.healthBasicEur || k.careEur || (!married && k.kinshipB))),
    )
  }

  const opKnown = ae === 'Inland' || ae === 'Verstorben'

  // Familienkasse: pick instead of type. Empty field → the offices of the user's Bundesland;
  // typed text → every office containing it; a complete name → nothing left to offer.
  const typedOffice = familyBenefitsOffice.trim().toLocaleLowerCase('de')
  const officeSuggestions =
    typedOffice === ''
      ? familyBenefitsOfficesForState(addressState)
      : FAMILY_BENEFITS_OFFICES.map((office) => office.name).filter(
          (name) => name.toLocaleLowerCase('de').includes(typedOffice) && name.toLocaleLowerCase('de') !== typedOffice,
        )

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
    if (!firstName.trim() || !lastName.trim() || !geburtsdatum.trim()) return
    const payload: ChildInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      geburtsdatum: germanToIso(geburtsdatum) ?? '',
      ...(taxId.trim() && { taxId: taxId.trim() }),
      ...(childBenefit.trim() && { childBenefitClaimEur: childBenefit.trim() }),
      kinship: relationship,
      kinshipB: relationshipB,
      familyBenefitsOffice: familyBenefitsOffice.trim() || null,
      domesticResidenceAllYear: inland,
      otherParent: ae,
      otherParentName: opKnown ? opName.trim() || null : null,
      otherParentBirthDate: opKnown ? germanToIso(opBirthDate) : null,
      otherParentAddress: opKnown ? opAddress.trim() || null : null,
      otherParentKind: opKnown ? opKind : null,
      otherParentDiedOn: ae === 'Verstorben' ? germanToIso(opDiedOn) : null,
      registeredWithMeAllYear: registered,
      childBenefitToMeAllYear: childBenefitToMe,
      healthBasicEur: /^\d+$/.test(kvBasis.trim()) ? kvBasis.trim() : null,
      careEur: /^\d+$/.test(pv.trim()) ? pv.trim() : null,
      swissFamilyAllowanceEur: /^\d+$/.test(swissAllowance.trim()) ? swissAllowance.trim() : null,
    }
    try {
      if (edited) {
        if (onSaveChild) await onSaveChild(edited, payload)
      } else if (onAddChild) {
        await onAddChild(payload)
      }
    } catch {
      // The save did not reach the server: keep the form open with the user's input.
      return
    }
    if (edited) {
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

  /** Married people need it for the joint return; for everyone else it sits among the further details. */
  const spouseRelationshipField = (
    <Feld label="Kindschaftsverhältnis zu deinem Ehepartner (nur bei Zusammenveranlagung)">
      <View style={styles.chips}>
        {CHILD_RELATIONSHIPS.map((value) => (
          <Chip key={value} active={relationshipB === value} onPress={() => setRelationshipB(value)} testID={`kind-verhaeltnis-b-${value}`}>
            {KINSHIP_LABEL[value]}
          </Chip>
        ))}
        <Chip active={relationshipB === null} onPress={() => setRelationshipB(null)} testID="kind-verhaeltnis-b-keins">
          Keines
        </Chip>
      </View>
    </Feld>
  )

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="kinder-screen">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('kinder.back', 'Zurück')} onPress={() => onBack()} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('kinder.heading', 'Kinder & Anlage Kind')}</Text>
      <Text style={styles.help}>
        {tr(
          'kinder.help',
          'Erfasse deine Kinder für die steuerliche Berücksichtigung (Kinderfreibetrag § 32 EStG, BEA-Freibetrag und Günstigerprüfung zum Kindergeld).',
        )}
      </Text>

      {householdSlot}

      {kinder.length > 0 && (
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{tr('kinder.summaryTitle', 'Steuerliche Entlastung')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{tr('kinder.freibetragLabel', 'Kinderfreibetrag Gesamt:')}</Text>
            <Text style={styles.summaryValue}>{formatEuro(foldStatus.totalAllowance)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{tr('kinder.kindergeldLabel', 'Kindergeld Anspruch:')}</Text>
            <Text style={styles.summaryValue}>{formatEuro(foldStatus.childBenefitSum)}</Text>
          </View>
          {foldStatus.swissFamilyAllowanceSum > 0 ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summarySubLabel}>{tr('kinder.schweizLabel', 'davon Schweizer Kinderzulage:')}</Text>
                <Text style={styles.summarySubValue}>{formatEuro(foldStatus.swissFamilyAllowanceSum)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summarySubLabel}>{tr('kinder.diffLabel', 'davon Differenz-Kindergeld (DE):')}</Text>
                <Text style={styles.summarySubValue}>{formatEuro(foldStatus.differentialChildBenefitSum)}</Text>
              </View>
            </>
          ) : null}
        </Card>
      )}

      {kinder.map((k, index) => (
        <Card key={k.id} style={styles.kindCard}>
          <View style={styles.kindHeader}>
            <Text style={styles.kindName}>
              {`${index + 1}. ${k.firstName} ${k.lastName}`}
            </Text>
            <View style={styles.kindActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kind ${k.firstName} bearbeiten`}
                onPress={() => {
                  fillForm(k)
                  setFormOpen(true)
                }}
              >
                <Text style={styles.editButton}>{tr('kinder.edit', 'Bearbeiten')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kind ${k.firstName} löschen`}
                onPress={() => handleDelete(k.id)}
              >
                <Text style={styles.deleteButton}>{tr('kinder.delete', 'Löschen')}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.kindDetail}>Geburtsdatum: {isoToGerman(k.geburtsdatum) || k.geburtsdatum}</Text>
          {k.taxId && <Text style={styles.kindDetail}>Steuer-ID: {k.taxId}</Text>}
          {k.swissFamilyAllowanceEur && Number(k.swissFamilyAllowanceEur) > 0 ? (
            <>
              <Text style={styles.kindDetail}>
                {`Schweizer Kinderzulage: ${formatEuro(Number(k.swissFamilyAllowanceEur))}`}
              </Text>
              <Text style={styles.kindDetail}>
                {`Differenz-Kindergeld: ${formatEuro(Number(k.differentialChildBenefitEur ?? Math.max(0, monthlyChildBenefitClaim(taxYear) * claimMonths(k.geburtsdatum, taxYear) - Number(k.swissFamilyAllowanceEur))))}`}
              </Text>
              <Text style={styles.kindDetail}>
                {`Gesamtanspruch (Anlage Kind Z. 6): ${formatEuro(Number(k.totalClaimEur ?? k.childBenefitClaimEur ?? Math.max(monthlyChildBenefitClaim(taxYear) * claimMonths(k.geburtsdatum, taxYear), Number(k.swissFamilyAllowanceEur))))}`}
              </Text>
            </>
          ) : (
            <Text style={styles.kindDetail}>
              Kindergeld:{' '}
              {k.childBenefitClaimEur
                ? `${k.childBenefitClaimEur} €`
                : `${formatEuro(monthlyChildBenefitClaim(taxYear) * claimMonths(k.geburtsdatum, taxYear))} (gesetzlich)`}
            </Text>
          )}
          {missingForPrintout(k) ? (
            <Text style={styles.luecke}>
              {tr('kinder.luecke', 'Für den Ausdruck fehlen noch Angaben (Steuer-ID, Kindschaftsverhältnis, Familienkasse, Wohnsitz).')}
            </Text>
          ) : null}
        </Card>
      ))}

      {formOpen ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>
            {edited ? tr('kinder.editTitle', 'Kind bearbeiten') : tr('kinder.addTitle', 'Kind hinzufügen')}
          </Text>
          {edited === null && kinder.length > 0 ? (
            <View style={styles.copyBox} testID="kind-geschwister">
              <Text style={styles.kindDetail}>
                {copiedFrom !== null
                  ? tr('kinder.geschwister.uebernommen', { name: copiedFrom, defaultValue: 'Von {{name}} übernommen. Bitte prüf die Angaben; Vorname, Geburtsdatum und Steuer-ID fehlen noch.' })
                  : tr('kinder.geschwister.frage', 'Gleiche Familie? Übernimm Nachname, Familienkasse, Verhältnis, Wohnsitz und anderen Elternteil von einem Geschwisterkind.')}
              </Text>
              <View style={styles.chips}>
                {kinder.map((k, index) => (
                  <Chip key={k.id} active={false} onPress={() => copyFromSibling(k)} testID={`kind-geschwister-${index}`}>
                    {tr('kinder.geschwister.von', { name: k.firstName, defaultValue: 'Von {{name}} übernehmen' })}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
          <Feld label="Vorname">
            <Input value={firstName} onChange={setFirstName} placeholder="z.B. Lina" accessibilityLabel="Vorname" autoComplete="given-name" testID="kind-vorname" />
          </Feld>
          <Feld label="Nachname">
            <Input value={lastName} onChange={setLastName} placeholder="z.B. Mustermann" accessibilityLabel="Nachname" autoComplete="family-name" testID="kind-nachname" />
          </Feld>
          {edited === null && suggestedLastName !== '' && lastName === suggestedLastName && copiedFrom === null ? (
            <Text style={styles.suggestion} testID="kind-nachname-vorschlag">
              {tr('kinder.nachnameVorschlag', 'Vorschlag: dein eigener Nachname. Ändere ihn, wenn das Kind anders heißt.')}
            </Text>
          ) : null}
          <Feld label="Geburtsdatum (TT.MM.JJJJ)">
            <DateInput
              value={geburtsdatum}
              onChange={setBirthDate}
              calendarLabel={tr('datum.kalender')}
              accessibilityLabel="Geburtsdatum"
              max={todayIso()}
              testID="kind-geburtsdatum"
            />
          </Feld>
          <Feld label="Steuer-Identifikationsnummer">
            <Input
              value={taxId}
              onChange={setTaxId}
              placeholder="11 Ziffern"
              type="numeric"
              accessibilityLabel="Steuer-Identifikationsnummer"
              testID="kind-steuerid"
            />
            <TaxIdHint value={taxId} testID="kind-steuerid-hinweis" />
          </Feld>
          <Feld label="Kindschaftsverhältnis zu dir">
            <View style={styles.chips}>
              {CHILD_RELATIONSHIPS.map((value) => (
                <Chip key={value} active={relationship === value} onPress={() => setRelationship(value)} testID={`kind-verhaeltnis-${value}`}>
                  {KINSHIP_LABEL[value]}
                </Chip>
              ))}
            </View>
          </Feld>
          {married ? spouseRelationshipField : null}
          <Feld label="Für das Kindergeld zuständige Familienkasse">
            <Input
              value={familyBenefitsOffice}
              onChange={setFamilyBenefitsOffice}
              placeholder="z.B. Familienkasse Sachsen"
              accessibilityLabel="Familienkasse"
              testID="kind-familienkasse"
            />
          </Feld>
          {officeSuggestions.length > 0 ? (
            <View style={styles.officeBox} testID="kind-familienkasse-vorschlaege">
              <Text style={styles.kindDetail}>
                {typedOffice === '' && addressState !== null
                  ? tr('kinder.familienkasse.ausAdresse', 'Vorschlag aus deiner Adresse. Die Familienkasse steht auf deinem Kindergeldbescheid.')
                  : tr('kinder.familienkasse.waehlen', 'Tippe zum Auswählen. Die Familienkasse steht auf deinem Kindergeldbescheid.')}
              </Text>
              <View style={styles.chips}>
                {officeSuggestions.map((name, index) => (
                  <Chip key={name} active={false} onPress={() => setFamilyBenefitsOffice(name)} testID={`kind-familienkasse-vorschlag-${index}`}>
                    {name.replace('Familienkasse ', '')}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
          <Feld label={`Hat das Kind ${taxYear} durchgehend in Deutschland gewohnt?`}>
            <View style={styles.chips}>
              <Chip active={inland === true} onPress={() => setInland(true)} testID="kind-inland-ja">
                Ja
              </Chip>
              <Chip active={inland === false} onPress={() => setInland(false)} testID="kind-inland-nein">
                Nein
              </Chip>
            </View>
          </Feld>
          <Feld label="Der andere Elternteil (nicht nötig, wenn ihr beide Eltern seid und zusammen veranlagt werdet)">
            <View style={styles.chips}>
              {OTHER_PARENT_STATUSES.map((status) => (
                <Chip key={status} active={ae === status} onPress={() => setAe(status)} testID={`kind-ae-${status}`}>
                  {OTHER_PARENT_LABEL[status]}
                </Chip>
              ))}
            </View>
          </Feld>
          {opKnown ? (
            <>
              <Feld label="Name, Vorname">
                <Input value={opName} onChange={setOpName} placeholder="z.B. Muster, Max" accessibilityLabel="Name des anderen Elternteils" autoComplete="off" />
              </Feld>
              <Feld label="Geburtsdatum (TT.MM.JJJJ)">
                <DateInput
                  value={opBirthDate}
                  onChange={setOpBirthDate}
                  calendarLabel={tr('datum.kalender')}
                  accessibilityLabel="Geburtsdatum des anderen Elternteils"
                  max={todayIso()}
                  testID="kind-ae-geburtsdatum"
                />
              </Feld>
              <AddressSearch
                postalCode=""
                testIDPrefix="kind-ae"
                onPick={(address) => {
                  const number = address.houseNumber !== null ? ` ${address.houseNumber}${address.houseNumberSuffix ?? ''}` : ''
                  setOpAddress(`${address.street}${number}, ${address.postalCode} ${address.city}`)
                }}
              />
              <Feld label={ae === 'Inland' ? 'Adresse' : 'Letzte bekannte Adresse (optional)'}>
                <Input value={opAddress} onChange={setOpAddress} accessibilityLabel="Adresse des anderen Elternteils" autoComplete="off" />
              </Feld>
              <Feld label="Kindschaftsverhältnis zum anderen Elternteil">
                <View style={styles.chips}>
                  {OTHER_CHILD_RELATIONSHIPS.map((value) => (
                    <Chip key={value} active={opKind === value} onPress={() => setOpKind(value)} testID={`kind-ae-art-${value}`}>
                      {KINSHIP_LABEL[value]}
                    </Chip>
                  ))}
                </View>
              </Feld>
              {ae === 'Verstorben' ? (
                <Feld label="Todestag (TT.MM.JJJJ)">
                  <DateInput
                    value={opDiedOn}
                    onChange={setOpDiedOn}
                    calendarLabel={tr('datum.kalender')}
                    accessibilityLabel="Todestag des anderen Elternteils"
                    max={todayIso()}
                    testID="kind-ae-todestag"
                  />
                </Feld>
              ) : null}
            </>
          ) : null}
          {married ? null : (
          <>
          <Text style={styles.formTitle}>{tr('kinder.entlastungTitel', 'Entlastungsbetrag für Alleinerziehende')}</Text>
          <Text style={styles.kindDetail}>
            {tr(
              'kinder.entlastungHilfe',
              'Nur wenn du allein mit dem Kind lebst. Der Ausdruck beantragt ihn für das ganze Jahr; Teilzeiträume kann er noch nicht.',
            )}
          </Text>
          <Feld label={`War das Kind ${taxYear} das ganze Jahr bei dir gemeldet?`}>
            <View style={styles.chips}>
              <Chip active={registered === true} onPress={() => setRegistered(true)} testID="kind-gemeldet-ja">
                Ja
              </Chip>
              <Chip active={registered === false} onPress={() => setRegistered(false)} testID="kind-gemeldet-nein">
                Nein
              </Chip>
            </View>
          </Feld>
          <Feld label={`Wurde das Kindergeld ${taxYear} das ganze Jahr an dich ausgezahlt?`}>
            <View style={styles.chips}>
              <Chip active={childBenefitToMe === true} onPress={() => setChildBenefitToMe(true)} testID="kind-kindergeld-an-mich-ja">
                Ja
              </Chip>
              <Chip active={childBenefitToMe === false} onPress={() => setChildBenefitToMe(false)} testID="kind-kindergeld-an-mich-nein">
                Nein
              </Chip>
            </View>
          </Feld>
          </>
          )}
          <Button
            variant="ghost"
            onPress={() => setMoreOpen(!moreOpen)}
            style={styles.toggleButton}
            testID="kind-weitere-angaben"
          >
            {moreOpen
              ? tr('kinder.wenigerAngaben', 'Weitere Angaben ausblenden')
              : tr('kinder.weitereAngaben', 'Weitere Angaben (Kindergeld, Versicherung des Kindes, Schweizer Zulage)')}
          </Button>
          {moreOpen ? (
            <>
              {married ? null : spouseRelationshipField}
              <Feld label="Erhaltenes Kindergeld im Steuerjahr (optional in €)">
                <Input
                  value={childBenefit}
                  onChange={setChildBenefit}
                  placeholder="3000"
                  type="numeric"
                  accessibilityLabel="Kindergeld"
                  testID="kind-kindergeld"
                />
              </Feld>
              <Feld label="Schweizer Kinderzulage im Steuerjahr (in €, optional)">
                <Input
                  value={swissAllowance}
                  onChange={setSwissAllowance}
                  placeholder="z.B. 2748"
                  type="numeric"
                  accessibilityLabel="Schweizer Kinderzulage"
                  testID="kind-schweizer-kinderzulage"
                />
              </Feld>
              <Feld label="Krankenversicherung des Kindes, die ihr zahlt (Basisabsicherung, € im Jahr, optional)">
                <Input
                  value={kvBasis}
                  onChange={setKvBasis}
                  placeholder="z.B. 1080"
                  type="numeric"
                  accessibilityLabel="Krankenversicherung des Kindes"
                />
              </Feld>
              <Feld label="Pflegeversicherung des Kindes, die ihr zahlt (€ im Jahr, optional)">
                <Input value={pv} onChange={setPv} placeholder="z.B. 0" type="numeric" accessibilityLabel="Pflegeversicherung des Kindes" />
              </Feld>
            </>
          ) : null}
          <Button onPress={handleSave} style={styles.addButton} testID="kind-speichern">
            {tr('kinder.save', 'Kind speichern')}
          </Button>
        </Card>
      ) : (
        <Button
          variant="ghost"
          onPress={() => {
            fillForm(null)
            setFormOpen(true)
          }}
          style={styles.toggleButton}
          testID="kind-neu"
        >
          + Weiteres Kind hinzufügen
        </Button>
      )}

      {onSingleParentQuestions && kinder.length > 0 && !married ? (
        <Button variant="ghost" onPress={onSingleParentQuestions} style={styles.toggleButton}>
          {tr('kinder.entlastungFragen', 'Fragen zum Entlastungsbetrag beantworten')}
        </Button>
      ) : null}

      <Button onPress={() => onDone()} style={styles.cta} testID="kinder-weiter">
        {tr('kinder.done', 'Weiter')}
      </Button>
    </ScrollView>
  )
}
