import { useState } from 'react'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { germanToIso, isoToGerman } from '../master-data/masterDataMapping'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, useBreakpoint, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  claimMonths,
  formatEuro,
  monthlyChildBenefitClaim,
  calculateChildrenStatus,
  OTHER_CHILD_RELATIONSHIPS,
  OTHER_PARENT_STATUSES,
  CHILD_RELATIONSHIPS,
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
    />
    </>
  )
}

function KinderScreenView({
  onDone = () => {},
  onBack,
  taxYear = CURRENT_TAX_YEAR,
  initialKinder = [],
  onAddChild,
  onSaveChild,
  onDeleteChild,
  onSingleParentQuestions,
  married = false,
}: ChildrenScreenProps & { readonly initialKinder: readonly ChildItem[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const [kinder, setKinder] = useState<readonly ChildItem[]>(initialKinder)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
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
    setLastName(k?.lastName ?? '')
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
  }

  const opKnown = ae === 'Inland' || ae === 'Verstorben'

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
          <Feld label="Vorname">
            <Input value={firstName} onChange={setFirstName} placeholder="z.B. Lina" accessibilityLabel="Vorname" testID="kind-vorname" />
          </Feld>
          <Feld label="Nachname">
            <Input value={lastName} onChange={setLastName} placeholder="z.B. Mustermann" accessibilityLabel="Nachname" testID="kind-nachname" />
          </Feld>
          <Feld label="Geburtsdatum (TT.MM.JJJJ)">
            <Input
              value={geburtsdatum}
              onChange={setBirthDate}
              placeholder="z.B. 12.05.2018"
              accessibilityLabel="Geburtsdatum"
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
          </Feld>
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
          <Feld label="Kindschaftsverhältnis zu dir">
            <View style={styles.chips}>
              {CHILD_RELATIONSHIPS.map((value) => (
                <Chip key={value} active={relationship === value} onPress={() => setRelationship(value)} testID={`kind-verhaeltnis-${value}`}>
                  {KINSHIP_LABEL[value]}
                </Chip>
              ))}
            </View>
          </Feld>
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
          <Feld label="Für das Kindergeld zuständige Familienkasse">
            <Input
              value={familyBenefitsOffice}
              onChange={setFamilyBenefitsOffice}
              placeholder="z.B. Familienkasse Sachsen"
              accessibilityLabel="Familienkasse"
              testID="kind-familienkasse"
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
                <Input value={opName} onChange={setOpName} placeholder="z.B. Muster, Max" accessibilityLabel="Name des anderen Elternteils" />
              </Feld>
              <Feld label="Geburtsdatum (TT.MM.JJJJ)">
                <Input
                  value={opBirthDate}
                  onChange={setOpBirthDate}
                  placeholder="z.B. 11.02.1984"
                  accessibilityLabel="Geburtsdatum des anderen Elternteils"
                />
              </Feld>
              <Feld label={ae === 'Inland' ? 'Adresse' : 'Letzte bekannte Adresse (optional)'}>
                <Input value={opAddress} onChange={setOpAddress} accessibilityLabel="Adresse des anderen Elternteils" />
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
                  <Input value={opDiedOn} onChange={setOpDiedOn} accessibilityLabel="Todestag des anderen Elternteils" />
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

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s4 }
  const summaryCard: ViewStyle = {
    padding: t.space.s4,
    marginBottom: t.space.s4,
    backgroundColor: t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.funke,
    borderRadius: t.radius.m,
  }
  const summaryTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const summaryRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: t.space.s1,
  }
  const summaryLabel: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.m,
    color: t.color.tinte2,
  }
  const summaryValue: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.m,
    fontWeight: t.weight.fett,
    color: t.color.tinte,
  }
  const summarySubLabel: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte2,
    paddingLeft: t.space.s2,
  }
  const summarySubValue: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte,
  }
  const childCard: ViewStyle = {
    padding: t.space.s4,
    marginBottom: t.space.s3,
    backgroundColor: t.color.karte,
    borderRadius: t.radius.m,
  }
  const childHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.space.s2,
  }
  const childName: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.l,
    color: t.color.tinte,
  }
  const deleteButton: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.fehler,
  }
  const childActions: ViewStyle = { flexDirection: 'row', gap: t.space.s3 }
  const editButton: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const gap: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler, marginTop: t.space.s2 }
  const chips: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const childDetail: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte2,
    marginVertical: 2,
  }
  const formCard: ViewStyle = {
    padding: t.space.s4,
    marginVertical: t.space.s4,
    backgroundColor: t.color.karte,
    borderRadius: t.radius.m,
  }
  const formTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const addButton: ViewStyle = {
    marginTop: t.space.s3,
  }
  const toggleButton: ViewStyle = {
    marginVertical: t.space.s3,
  }
  const cta: ViewStyle = {
    marginTop: t.space.s5,
    marginBottom: t.space.s6,
  }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    summaryCard,
    summaryTitle,
    summaryRow,
    summaryLabel,
    summaryValue,
    summarySubLabel,
    summarySubValue,
    kindCard: childCard,
    kindHeader: childHeader,
    kindName: childName,
    deleteButton,
    kindActions: childActions,
    editButton,
    luecke: gap,
    chips,
    kindDetail: childDetail,
    formCard,
    formTitle,
    addButton,
    toggleButton,
    cta,
  }
}
