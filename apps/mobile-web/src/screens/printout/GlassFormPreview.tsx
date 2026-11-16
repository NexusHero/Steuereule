import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Card, Chip, useTheme, type UiTheme } from '@steuereule/ui'
import { amountFromAnswer, formatEuro, type Answers, type Screen } from '@steuereule/core'
import {
  getCapitalControllerGetQueryKey,
  getChSalaryCertificateControllerGetQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getLstbControllerGetLstbQueryKey,
  getPensionControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useCapitalControllerGet,
  useCapitalControllerSetField,
  useChSalaryCertificateControllerGet,
  useChSalaryCertificateControllerSetField,
  useChildrenControllerList,
  useCommuteControllerGet,
  useConfirmationControllerGet,
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useLinkControllerGet,
  useLstbControllerGetLstb,
  useLstbControllerSetField,
  useMasterDataControllerRead,
  usePensionControllerGet,
  usePensionControllerSetField,
  useRentalControllerGet,
  type ProvenanceDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { maskTargetForAcroField } from '../shared/formLineMapping'
import { AcroFormLiveViewer, type AcroFormPdfLoader } from './AcroFormLiveViewer'

export interface GlassFormRow {
  readonly id: string
  readonly line: string
  readonly label: string
  readonly value: string
  readonly person?: 'A' | 'B' | 'gemeinsam' | undefined
  readonly provenanceLabel: string
  readonly screen: Screen
  readonly field?: string | undefined
}

export interface GlassFormSection {
  readonly formId: string
  readonly title: string
  readonly subtitle: string
  readonly rows: readonly GlassFormRow[]
}

export interface GlassFormPreviewProps {
  readonly year: number
  readonly defaultOpen?: boolean | undefined
  readonly defaultMode?: 'zeilen' | 'acroform' | undefined
  readonly initialAcroForm?: string | undefined
  readonly highlightedAcroFieldId?: string | undefined
  readonly acroFormLoader?: AcroFormPdfLoader | undefined
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
}

function formatProvenanceBadge(
  provenance: ProvenanceDto | undefined,
  tr: ReturnType<typeof useTranslation<typeof APP_NS>>['t'],
): string {
  if (!provenance) return tr('bestaetigung.herkunft.nutzer', { defaultValue: 'Selbst eingetragen' })
  switch (provenance.kind) {
    case 'nutzer':
      return tr('bestaetigung.herkunft.nutzer', { defaultValue: 'Selbst eingetragen' })
    case 'uebernahme':
      return tr('bestaetigung.herkunft.uebernahme', {
        vorjahr: provenance.lastYear,
        defaultValue: `Übernahme aus ${provenance.lastYear}`,
      })
    case 'assistent':
      return provenance.receiptId
        ? `📎 ${tr('bestaetigung.herkunft.assistentBeleg', { name: provenance.name, defaultValue: `${provenance.name} (Beleg)` })}`
        : `🦉 ${tr('bestaetigung.herkunft.assistent', { name: provenance.name, defaultValue: provenance.name })}`
    case 'beleg':
      return `📎 ${tr('bestaetigung.herkunft.beleg', { defaultValue: 'Aus Beleg' })}`
  }
}

export function GlassFormPreview({
  year,
  defaultOpen = false,
  defaultMode = 'zeilen',
  initialAcroForm,
  highlightedAcroFieldId,
  acroFormLoader,
  onInspectField,
}: GlassFormPreviewProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(defaultOpen)
  const [activeFilter, setActiveFilter] = useState<string>('alle')
  const [viewMode, setViewMode] = useState<'zeilen' | 'acroform'>(defaultMode)

  if (!open) {
    return (
      <Card style={styles.collapsedCard} testID="glass-form-preview-collapsed">
        <View style={styles.collapsedHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.collapsedTitle}>
              {tr('ausdruck.glasErklaerung.titel', '🔍 Glas-Erklärung: Amtliche Formular-Vorschau')}
            </Text>
            <Text style={styles.collapsedSubtitle}>
              {tr(
                'ausdruck.glasErklaerung.untertitel',
                'Sieh live, in welchem amtlichen Vordruck und welcher Zeile deine Angaben landen – inklusive Herkunft und Direktsprung in die Maske.',
              )}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(true)}
            style={styles.toggleButton}
            testID="glass-form-preview-toggle"
          >
            <Text style={styles.toggleButtonText}>
              {tr('ausdruck.glasErklaerung.oeffnen', 'Formularzeilen ansehen ▼')}
            </Text>
          </Pressable>
        </View>
      </Card>
    )
  }

  return (
    <GlassFormPreviewBody
      year={year}
      activeFilter={activeFilter}
      onSelectFilter={setActiveFilter}
      viewMode={viewMode}
      onChangeViewMode={setViewMode}
      initialAcroForm={initialAcroForm}
      highlightedAcroFieldId={highlightedAcroFieldId}
      acroFormLoader={acroFormLoader}
      onCollapse={defaultOpen ? undefined : () => setOpen(false)}
      onInspectField={onInspectField}
    />
  )
}

function GlassFormPreviewBody({
  year,
  activeFilter,
  onSelectFilter,
  viewMode,
  onChangeViewMode,
  initialAcroForm,
  highlightedAcroFieldId,
  acroFormLoader,
  onCollapse,
  onInspectField,
}: {
  readonly year: number
  readonly activeFilter: string
  readonly onSelectFilter: (filter: string) => void
  readonly viewMode: 'zeilen' | 'acroform'
  readonly onChangeViewMode: (mode: 'zeilen' | 'acroform') => void
  readonly initialAcroForm?: string | undefined
  readonly highlightedAcroFieldId?: string | undefined
  readonly acroFormLoader?: AcroFormPdfLoader | undefined
  readonly onCollapse?: (() => void) | undefined
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()

  const masterDataQuery = useMasterDataControllerRead()
  const linkQuery = useLinkControllerGet(year)
  const interviewQuery = useInterviewControllerGetInterview(year)
  const lstbQuery = useLstbControllerGetLstb(year)
  const commuteQuery = useCommuteControllerGet(year)
  const chQuery = useChSalaryCertificateControllerGet(year)
  const pensionQuery = usePensionControllerGet(year)
  const capitalQuery = useCapitalControllerGet(year)
  const rentalQuery = useRentalControllerGet(year)
  const childrenQuery = useChildrenControllerList(year)
  const confirmationQuery = useConfirmationControllerGet(year)

  const lstbSetField = useLstbControllerSetField()
  const chSetField = useChSalaryCertificateControllerSetField()
  const capSetField = useCapitalControllerSetField()
  const pensionSetField = usePensionControllerSetField()
  const interviewPostAnswer = useInterviewControllerPostAnswer()

  async function handleSaveAcroField(acroFieldId: string, rawValue: string) {
    const target = maskTargetForAcroField(acroFieldId)
    const numeric = Number(rawValue.replace(/\./g, '').replace(',', '.').trim())
    const hasNumber = Number.isFinite(numeric) && numeric >= 0

    try {
      if (target.screen === 'lstb' && target.field && hasNumber) {
        await lstbSetField.mutateAsync({
          jahr: year,
          feld: target.field as 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung',
          data: { kind: 'erfasst', value: Math.round(numeric) },
        })
        await queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(year) })
      } else if (target.screen === 'chLohnausweis' && target.field && hasNumber) {
        await chSetField.mutateAsync({
          jahr: year,
          feld: target.field as 'grossWageChf' | 'ahvContributionsChf' | 'withholdingTaxChf',
          data: { kind: 'erfasst', value: Math.round(numeric) },
        })
        await queryClient.invalidateQueries({ queryKey: getChSalaryCertificateControllerGetQueryKey(year) })
      } else if (target.screen === 'kapital' && target.field && hasNumber) {
        await capSetField.mutateAsync({
          jahr: year,
          feld: target.field as 'kapitalertraege' | 'sparerPauschbetrag' | 'kapitalertragsteuer',
          data: { kind: 'erfasst', value: Math.round(numeric) },
        })
        await queryClient.invalidateQueries({ queryKey: getCapitalControllerGetQueryKey(year) })
      } else if (target.screen === 'rente' && target.field && hasNumber) {
        await pensionSetField.mutateAsync({
          jahr: year,
          feld: target.field as 'jahresbetrag',
          data: { kind: 'erfasst', value: Math.round(numeric) },
        })
        await queryClient.invalidateQueries({ queryKey: getPensionControllerGetQueryKey(year) })
      } else if (target.screen === 'interview' && target.field) {
        await interviewPostAnswer.mutateAsync({
          jahr: year,
          data: { questionId: target.field, value: rawValue.trim() },
        })
        await queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(year) })
      }
      await queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(year) })
      await queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(year) })
    } catch {
      // Fallback: keep local draft visible if API rejects
    }
  }

  const linkData = linkQuery.data?.status === 200 ? linkQuery.data.data : null
  const isJoint = linkData?.filingType === 'zusammen'
  const partnerName = linkData?.personB?.firstName?.trim() || 'Partner (Person B)'

  const lstbBQuery = useLstbControllerGetLstb(year, { person: 'B' }, { query: { enabled: isJoint } })
  const commuteBQuery = useCommuteControllerGet(year, { person: 'B' }, { query: { enabled: isJoint } })
  const chBQuery = useChSalaryCertificateControllerGet(year, { person: 'B' }, { query: { enabled: isJoint } })
  const pensionBQuery = usePensionControllerGet(year, { person: 'B' }, { query: { enabled: isJoint } })
  const interviewBQuery = useInterviewControllerGetInterview(
    year,
    { eintrag: 'lebenslagen', person: 'B' },
    { query: { enabled: isJoint } },
  )

  const provenanceByKey = new Map<string, ProvenanceDto>()
  if (confirmationQuery.data?.status === 200) {
    for (const annex of confirmationQuery.data.data.annexes) {
      for (const item of annex.values) {
        provenanceByKey.set(item.key, item.provenance)
        provenanceByKey.set(`${item.screen}.${item.field}`, item.provenance)
      }
    }
  }

  const prov = (screen: Screen, field?: string): string => {
    const found = field ? provenanceByKey.get(`${screen}.${field}`) : undefined
    return formatProvenanceBadge(found, tr)
  }

  const sections: GlassFormSection[] = []

  // 1. Hauptvordruck ESt 1 A
  const est1aRows: GlassFormRow[] = []
  const md = masterDataQuery.data?.status === 200 ? masterDataQuery.data.data : null
  const answers = (interviewQuery.data?.status === 200 ? interviewQuery.data.data.answers : {}) as Answers
  const answersB = (interviewBQuery.data?.status === 200 ? interviewBQuery.data.data.answers : {}) as Answers

  if (md?.wohnort || md?.strasse) {
    est1aRows.push({
      id: 'est1a-adresse',
      line: 'Zeilen 8–14',
      label: 'Wohnsitz & Steuerpflichtige Person A',
      value: [md.strasse, md.hausnummer, md.plz, md.wohnort].filter(Boolean).join(' '),
      person: 'A',
      provenanceLabel: prov('stammdaten', 'wohnort'),
      screen: 'stammdaten',
      field: 'wohnort',
    })
  }
  if (md?.familienstand) {
    est1aRows.push({
      id: 'est1a-familienstand',
      line: 'Zeile 18',
      label: 'Familienstand',
      value: md.familienstand === 'verheiratet' ? 'Verheiratet' : md.familienstand,
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('stammdaten', 'familienstand'),
      screen: 'stammdaten',
      field: 'familienstand',
    })
  }
  if (isJoint) {
    est1aRows.push({
      id: 'est1a-veranlagung',
      line: 'Zeilen 19–24',
      label: `Zusammenveranlagung mit ${partnerName}`,
      value: [linkData?.personB?.firstName, linkData?.personB?.lastName, linkData?.personB?.beruf]
        .filter(Boolean)
        .join(' · ') || 'Gemeinsame Erklärung (§ 26b EStG)',
      person: 'gemeinsam',
      provenanceLabel: prov('kopplung', 'filingType'),
      screen: 'stammdaten',
      field: 'familienstand',
    })
  }
  if (md?.iban) {
    est1aRows.push({
      id: 'est1a-iban',
      line: 'Zeilen 31–36',
      label: 'Bankverbindung für Erstattung (IBAN)',
      value: md.iban,
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('stammdaten', 'iban'),
      screen: 'stammdaten',
      field: 'iban',
    })
  }
  const lohnersatzA = amountFromAnswer(answers['lohnersatz-betrag'])
  if (lohnersatzA !== null && lohnersatzA > 0) {
    est1aRows.push({
      id: 'est1a-lohnersatz-a',
      line: 'Zeile 43 (Kz 120)',
      label: 'Einkommensersatzleistungen (Progressionsvorbehalt)',
      value: formatEuro(lohnersatzA),
      person: 'A',
      provenanceLabel: prov('interview', 'lohnersatz-betrag'),
      screen: 'interview',
      field: 'lohnersatz-betrag',
    })
  }
  const lohnersatzB = amountFromAnswer(answersB['lohnersatz-betrag'])
  if (lohnersatzB !== null && lohnersatzB > 0) {
    est1aRows.push({
      id: 'est1a-lohnersatz-b',
      line: 'Zeile 43 (Kz 121)',
      label: `Einkommensersatzleistungen (${partnerName})`,
      value: formatEuro(lohnersatzB),
      person: 'B',
      provenanceLabel: prov('interview', 'lohnersatz-betrag'),
      screen: 'interview',
      field: 'lohnersatz-betrag',
    })
  }
  const vorauszahlungen = amountFromAnswer(answers['vorauszahlungen-betrag'])
  if (vorauszahlungen !== null && vorauszahlungen > 0) {
    est1aRows.push({
      id: 'est1a-vorauszahlungen',
      line: 'Anrechnung (§ 36)',
      label: 'Geleistete Einkommensteuer-Vorauszahlungen',
      value: formatEuro(vorauszahlungen),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'vorauszahlungen-betrag'),
      screen: 'interview',
      field: 'vorauszahlungen-betrag',
    })
  }
  if (est1aRows.length > 0) {
    sections.push({
      formId: 'est1a',
      title: 'Hauptvordruck ESt 1 A',
      subtitle: 'Stammdaten, Veranlagungsart, Bankverbindung & Progressionsvorbehalt',
      rows: est1aRows,
    })
  }

  // 2. Anlage N (Angestellte & Werbungskosten)
  const anlageNRows: GlassFormRow[] = []
  const lstb = lstbQuery.data?.status === 200 ? lstbQuery.data.data : null
  const lstbB = lstbBQuery.data?.status === 200 ? lstbBQuery.data.data : null
  const commute = commuteQuery.data?.status === 200 ? commuteQuery.data.data : null
  const commuteB = commuteBQuery.data?.status === 200 ? commuteBQuery.data.data : null

  if (lstb?.bruttoarbeitslohn.kind === 'erfasst' && lstb.bruttoarbeitslohn.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-brutto-a',
      line: 'Zeile 6 (Kz 110)',
      label: 'Bruttoarbeitslohn (laut LStB Zeile 3)',
      value: formatEuro(lstb.bruttoarbeitslohn.value),
      person: 'A',
      provenanceLabel: prov('lstb', 'bruttoarbeitslohn'),
      screen: 'lstb',
      field: 'bruttoarbeitslohn',
    })
  }
  if (lstb?.lohnsteuer.kind === 'erfasst' && lstb.lohnsteuer.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-lst-a',
      line: 'Zeile 7 (Kz 140)',
      label: 'Einbehaltene Lohnsteuer (laut LStB Zeile 4)',
      value: formatEuro(lstb.lohnsteuer.value),
      person: 'A',
      provenanceLabel: prov('lstb', 'lohnsteuer'),
      screen: 'lstb',
      field: 'lohnsteuer',
    })
  }
  if (isJoint && lstbB?.bruttoarbeitslohn.kind === 'erfasst' && lstbB.bruttoarbeitslohn.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-brutto-b',
      line: 'Zeile 6 (Person B)',
      label: `Bruttoarbeitslohn (${partnerName})`,
      value: formatEuro(lstbB.bruttoarbeitslohn.value),
      person: 'B',
      provenanceLabel: prov('lstb', 'bruttoarbeitslohn'),
      screen: 'lstb',
      field: 'bruttoarbeitslohn',
    })
  }
  if (isJoint && lstbB?.lohnsteuer.kind === 'erfasst' && lstbB.lohnsteuer.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-lst-b',
      line: 'Zeile 7 (Person B)',
      label: `Einbehaltene Lohnsteuer (${partnerName})`,
      value: formatEuro(lstbB.lohnsteuer.value),
      person: 'B',
      provenanceLabel: prov('lstb', 'lohnsteuer'),
      screen: 'lstb',
      field: 'lohnsteuer',
    })
  }
  if (commute?.inputs && commute.commuterAllowance != null && commute.commuterAllowance > 0) {
    anlageNRows.push({
      id: 'anlageN-weg-a',
      line: 'Zeilen 31–39',
      label: `Entfernungspauschale (${commute.inputs.oneWayKm} km · ${commute.workdays?.commuteDays ?? 0} Tage)`,
      value: formatEuro(commute.commuterAllowance),
      person: 'A',
      provenanceLabel: prov('commute', 'oneWayKm'),
      screen: 'commute',
      field: 'oneWayKm',
    })
  }
  if (commute?.inputs && commute.inputs.homeOfficeDays > 0) {
    const hoDays = Math.min(commute.inputs.homeOfficeDays, 210)
    anlageNRows.push({
      id: 'anlageN-ho-a',
      line: 'Zeile 45 (Kz 335)',
      label: `Homeoffice-Pauschale (${commute.inputs.homeOfficeDays} Tage)`,
      value: formatEuro(hoDays * 6),
      person: 'A',
      provenanceLabel: prov('commute', 'homeOfficeDays'),
      screen: 'commute',
      field: 'homeOfficeDays',
    })
  }
  if (commute?.inputs?.workEquipmentEur && commute.inputs.workEquipmentEur > 0) {
    anlageNRows.push({
      id: 'anlageN-arbeitsmittel-a',
      line: 'Zeilen 42–43',
      label: 'Aufwendungen für Arbeitsmittel',
      value: formatEuro(commute.inputs.workEquipmentEur),
      person: 'A',
      provenanceLabel: prov('commute', 'workEquipmentEur'),
      screen: 'commute',
      field: 'workEquipmentEur',
    })
  }
  if (isJoint && commuteB?.inputs && commuteB.commuterAllowance != null && commuteB.commuterAllowance > 0) {
    anlageNRows.push({
      id: 'anlageN-weg-b',
      line: 'Zeilen 31–39 (Person B)',
      label: `Entfernungspauschale (${partnerName}, ${commuteB.inputs.oneWayKm} km)`,
      value: formatEuro(commuteB.commuterAllowance),
      person: 'B',
      provenanceLabel: prov('commute', 'oneWayKm'),
      screen: 'commute',
      field: 'oneWayKm',
    })
  }
  const fortbildung = amountFromAnswer(answers['fortbildung-kosten'])
  if (fortbildung !== null && fortbildung > 0) {
    anlageNRows.push({
      id: 'anlageN-fortbildung',
      line: 'Zeile 46',
      label: 'Berufliche Fortbildungskosten',
      value: formatEuro(fortbildung),
      person: 'A',
      provenanceLabel: prov('interview', 'fortbildung-kosten'),
      screen: 'interview',
      field: 'fortbildung-kosten',
    })
  }
  const umzug = amountFromAnswer(answers['umzug-kosten'])
  if (umzug !== null && umzug > 0) {
    anlageNRows.push({
      id: 'anlageN-umzug',
      line: 'Zeile 48',
      label: 'Beruflich veranlasste Umzugskosten',
      value: formatEuro(umzug),
      person: 'A',
      provenanceLabel: prov('interview', 'umzug-kosten'),
      screen: 'interview',
      field: 'umzug-kosten',
    })
  }
  const dhfMiete = amountFromAnswer(answers['dhf-miete'])
  if (dhfMiete !== null && dhfMiete > 0) {
    anlageNRows.push({
      id: 'anlageN-dhf',
      line: 'Anlage N-DHF',
      label: 'Doppelte Haushaltsführung (Monatsmiete am Arbeitsort)',
      value: `${formatEuro(dhfMiete)} / Monat`,
      person: 'A',
      provenanceLabel: prov('interview', 'dhf-miete'),
      screen: 'interview',
      field: 'dhf-miete',
    })
  }
  if (anlageNRows.length > 0) {
    sections.push({
      formId: 'anlageN',
      title: 'Anlage N',
      subtitle: 'Einkünfte aus nichtselbständiger Arbeit & Werbungskosten',
      rows: anlageNRows,
    })
  }

  // 3. Anlage N-Gre (Grenzgänger Schweiz)
  const nGreRows: GlassFormRow[] = []
  const ch = chQuery.data?.status === 200 ? chQuery.data.data : null
  const chB = chBQuery.data?.status === 200 ? chBQuery.data.data : null
  const chGrossA = ch?.fields.find((f) => f.id === 'grossWageChf')
  const chQstA = ch?.fields.find((f) => f.id === 'withholdingTaxChf')
  const chAhvA = ch?.fields.find((f) => f.id === 'ahvContributionsChf')

  if (chGrossA?.kind === 'erfasst' && chGrossA.value !== undefined) {
    nGreRows.push({
      id: 'ngre-brutto-a',
      line: 'Zeile 6',
      label: `Schweizer Bruttolohn (Lohnausweis Ziff. 8${ch?.exchangeRate ? ` · Kurs ${ch.exchangeRate.rate}` : ''})`,
      value: `${chGrossA.value.toLocaleString('de-DE')} CHF`,
      person: 'A',
      provenanceLabel: prov('chLohnausweis', 'grossWageChf'),
      screen: 'chLohnausweis',
      field: 'grossWageChf',
    })
  }
  if (chQstA?.kind === 'erfasst' && chQstA.value !== undefined) {
    nGreRows.push({
      id: 'ngre-qst-a',
      line: 'Zeile 24 (Kz 169)',
      label: 'Schweizer Quellensteuer (Anrechnung bis 4,5 %)',
      value: `${chQstA.value.toLocaleString('de-DE')} CHF`,
      person: 'A',
      provenanceLabel: prov('chLohnausweis', 'withholdingTaxChf'),
      screen: 'chLohnausweis',
      field: 'withholdingTaxChf',
    })
  }
  if (chAhvA?.kind === 'erfasst' && chAhvA.value !== undefined) {
    nGreRows.push({
      id: 'ngre-ahv-a',
      line: 'Zeilen 81–93',
      label: 'AHV / IV / EO / ALV Beiträge (Lohnausweis Ziff. 9)',
      value: `${chAhvA.value.toLocaleString('de-DE')} CHF`,
      person: 'A',
      provenanceLabel: prov('chLohnausweis', 'ahvContributionsChf'),
      screen: 'chLohnausweis',
      field: 'ahvContributionsChf',
    })
  }
  if (isJoint && chB) {
    const chGrossB = chB.fields.find((f) => f.id === 'grossWageChf')
    const chQstB = chB.fields.find((f) => f.id === 'withholdingTaxChf')
    if (chGrossB?.kind === 'erfasst' && chGrossB.value !== undefined) {
      nGreRows.push({
        id: 'ngre-brutto-b',
        line: 'Zeile 6 (Person B)',
        label: `Schweizer Bruttolohn (${partnerName})`,
        value: `${chGrossB.value.toLocaleString('de-DE')} CHF`,
        person: 'B',
        provenanceLabel: prov('chLohnausweis', 'grossWageChf'),
        screen: 'chLohnausweis',
        field: 'grossWageChf',
      })
    }
    if (chQstB?.kind === 'erfasst' && chQstB.value !== undefined) {
      nGreRows.push({
        id: 'ngre-qst-b',
        line: 'Zeile 24 (Person B)',
        label: `Schweizer Quellensteuer (${partnerName})`,
        value: `${chQstB.value.toLocaleString('de-DE')} CHF`,
        person: 'B',
        provenanceLabel: prov('chLohnausweis', 'withholdingTaxChf'),
        screen: 'chLohnausweis',
        field: 'withholdingTaxChf',
      })
    }
  }
  if (nGreRows.length > 0) {
    sections.push({
      formId: 'anlageNGre',
      title: 'Anlage N-Gre',
      subtitle: 'Grenzgänger Schweiz (DBA-Schweiz Art. 15a)',
      rows: nGreRows,
    })
  }

  // 4. Anlage Vorsorgeaufwand, Sonderausgaben & AV
  const vorsorgeRows: GlassFormRow[] = []
  if (lstb?.sozialversicherung.kind === 'erfasst' && lstb.sozialversicherung.value !== undefined) {
    vorsorgeRows.push({
      id: 'vorsorge-sv-a',
      line: 'Vorsorge Z. 12–28',
      label: 'Arbeitnehmeranteil Sozialversicherung (LStB Z. 23–27)',
      value: formatEuro(lstb.sozialversicherung.value),
      person: 'A',
      provenanceLabel: prov('lstb', 'sozialversicherung'),
      screen: 'lstb',
      field: 'sozialversicherung',
    })
  }
  if (isJoint && lstbB?.sozialversicherung.kind === 'erfasst' && lstbB.sozialversicherung.value !== undefined) {
    vorsorgeRows.push({
      id: 'vorsorge-sv-b',
      line: 'Vorsorge Z. 12–28 (B)',
      label: `Arbeitnehmeranteil Sozialversicherung (${partnerName})`,
      value: formatEuro(lstbB.sozialversicherung.value),
      person: 'B',
      provenanceLabel: prov('lstb', 'sozialversicherung'),
      screen: 'lstb',
      field: 'sozialversicherung',
    })
  }
  const kvPv = amountFromAnswer(answers['kv-pv-betrag'])
  if (kvPv !== null && kvPv > 0) {
    vorsorgeRows.push({
      id: 'vorsorge-kv-a',
      line: 'Vorsorge Z. 16–28',
      label: 'Selbst gezahlte Krankenversicherung (Basisabsicherung)',
      value: formatEuro(kvPv),
      person: 'A',
      provenanceLabel: prov('interview', 'kv-pv-betrag'),
      screen: 'interview',
      field: 'kv-pv-betrag',
    })
  }
  const spenden = amountFromAnswer(answers['spenden-betrag'])
  if (spenden !== null && spenden > 0) {
    vorsorgeRows.push({
      id: 'sonderausgaben-spenden',
      line: 'Sonderausgaben Z. 5',
      label: 'Spenden und Mitgliedsbeiträge (§ 10b EStG)',
      value: formatEuro(spenden),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'spenden-betrag'),
      screen: 'interview',
      field: 'spenden-betrag',
    })
  }
  const riester = amountFromAnswer(answers['riester-betrag'])
  if (riester !== null && riester > 0) {
    vorsorgeRows.push({
      id: 'anlageAV-riester',
      line: 'Anlage AV Z. 10',
      label: 'Gezahlte Altersvorsorgebeiträge (Riester)',
      value: formatEuro(riester),
      person: 'A',
      provenanceLabel: prov('interview', 'riester-betrag'),
      screen: 'interview',
      field: 'riester-betrag',
    })
  }
  if (vorsorgeRows.length > 0) {
    sections.push({
      formId: 'vorsorgeSonderausgaben',
      title: 'Anlage Vorsorgeaufwand, Sonderausgaben & AV',
      subtitle: 'Versicherungsbeiträge, Altersvorsorge & Spenden',
      rows: vorsorgeRows,
    })
  }

  // 5. Anlage Kind
  const kinderData = childrenQuery.data?.status === 200 ? childrenQuery.data.data : null
  if (kinderData && kinderData.kinder.length > 0) {
    const kindRows: GlassFormRow[] = kinderData.kinder.flatMap((k, idx) => {
      const name = [k.firstName, k.lastName].filter(Boolean).join(' ') || `Kind ${idx + 1}`
      const claimNum = Number(k.childBenefitClaimEur ?? 0)
      const childcareNum = Number(k.childcareEur ?? 0)
      const rows: GlassFormRow[] = [
        {
          id: `kind-${k.id}-stamm`,
          line: `Kind ${idx + 1} · Z. 4–10`,
          label: `${name}${k.geburtsdatum ? ` (*${k.geburtsdatum})` : ''}`,
          value: `Kindergeld: ${formatEuro(Number.isFinite(claimNum) ? claimNum : 0)}`,
          person: isJoint ? 'gemeinsam' : 'A',
          provenanceLabel: prov('kind', 'firstName'),
          screen: 'kind',
          field: 'firstName',
        },
      ]
      if (Number.isFinite(childcareNum) && childcareNum > 0) {
        rows.push({
          id: `kind-${k.id}-betreuung`,
          line: `Kind ${idx + 1} · Z. 67 (Kz 51)`,
          label: `Kinderbetreuungskosten (${name})`,
          value: formatEuro(childcareNum),
          person: isJoint ? 'gemeinsam' : 'A',
          provenanceLabel: prov('kind', 'childcareEur'),
          screen: 'kind',
          field: 'childcareEur',
        })
      }
      return rows
    })
    sections.push({
      formId: 'anlageKind',
      title: `Anlage Kind (${kinderData.kinder.length}×)`,
      subtitle: 'Kinderfreibeträge, Kindergeld, Differenzkindergeld & Betreuung',
      rows: kindRows,
    })
  }

  // 6. Anlage KAP
  const cap = capitalQuery.data?.status === 200 ? capitalQuery.data.data : null
  const capRows: GlassFormRow[] = []
  if (cap?.kapitalertraege.kind === 'erfasst' && cap.kapitalertraege.value !== undefined) {
    capRows.push({
      id: 'kap-ertraege',
      line: 'Zeile 7 / 19',
      label: 'Kapitalerträge (Zinsen, Dividenden, Fonds)',
      value: formatEuro(cap.kapitalertraege.value),
      person: cap.inhaber ?? (isJoint ? 'gemeinsam' : 'A'),
      provenanceLabel: prov('kapital', 'kapitalertraege'),
      screen: 'kapital',
      field: 'kapitalertraege',
    })
  }
  if (cap?.sparerPauschbetrag.kind === 'erfasst' && cap.sparerPauschbetrag.value !== undefined) {
    capRows.push({
      id: 'kap-pauschbetrag',
      line: 'Zeile 16',
      label: 'In Anspruch genommener Sparer-Pauschbetrag',
      value: formatEuro(cap.sparerPauschbetrag.value),
      person: cap.inhaber ?? (isJoint ? 'gemeinsam' : 'A'),
      provenanceLabel: prov('kapital', 'sparerPauschbetrag'),
      screen: 'kapital',
      field: 'sparerPauschbetrag',
    })
  }
  if (cap?.kapitalertragsteuer.kind === 'erfasst' && cap.kapitalertragsteuer.value !== undefined) {
    capRows.push({
      id: 'kap-kest',
      line: 'Zeile 47',
      label: 'Einbehaltene Kapitalertragsteuer (Abgeltungsteuer)',
      value: formatEuro(cap.kapitalertragsteuer.value),
      person: cap.inhaber ?? (isJoint ? 'gemeinsam' : 'A'),
      provenanceLabel: prov('kapital', 'kapitalertragsteuer'),
      screen: 'kapital',
      field: 'kapitalertragsteuer',
    })
  }
  if (capRows.length > 0) {
    sections.push({
      formId: 'anlageKap',
      title: 'Anlage KAP',
      subtitle: 'Einkünfte aus Kapitalvermögen & Günstigerprüfung',
      rows: capRows,
    })
  }

  // 7. Anlage V (Vermietung)
  const rental = rentalQuery.data?.status === 200 ? rentalQuery.data.data : null
  if (rental && rental.properties.length > 0) {
    const rentalRows: GlassFormRow[] = rental.properties.flatMap((obj, idx) => {
      const rows: GlassFormRow[] = []
      const title = [obj.strasse, obj.hausnummer, obj.city].filter(Boolean).join(' ') || `Objekt ${idx + 1}`
      if (obj.mieteinnahmen.kind === 'erfasst' && obj.mieteinnahmen.value !== undefined) {
        rows.push({
          id: `v-${obj.id}-miete`,
          line: `Objekt ${idx + 1} · Z. 9`,
          label: `Kaltmieteinnahmen (${title})`,
          value: formatEuro(obj.mieteinnahmen.value),
          person: isJoint ? 'gemeinsam' : 'A',
          provenanceLabel: prov('vermietung', 'mieteinnahmen'),
          screen: 'vermietung',
          field: 'mieteinnahmen',
        })
      }
      if (obj.werbungskosten.kind === 'erfasst' && obj.werbungskosten.value !== undefined) {
        rows.push({
          id: `v-${obj.id}-wk`,
          line: `Objekt ${idx + 1} · Z. 46–50`,
          label: `Laufende Werbungskosten (${title})`,
          value: formatEuro(obj.werbungskosten.value),
          person: isJoint ? 'gemeinsam' : 'A',
          provenanceLabel: prov('vermietung', 'werbungskosten'),
          screen: 'vermietung',
          field: 'werbungskosten',
        })
      }
      if (obj.anteilA) {
        rows.push({
          id: `v-${obj.id}-anteil`,
          line: `Objekt ${idx + 1} · Z. 86`,
          label: `Miteigentumsanteil Ehegatten (${title})`,
          value: `${obj.anteilA} % / ${100 - Number(obj.anteilA)} %`,
          person: 'gemeinsam',
          provenanceLabel: prov('vermietung', 'anteilA'),
          screen: 'vermietung',
          field: 'anteilA',
        })
      }
      return rows
    })
    if (rentalRows.length > 0) {
      sections.push({
        formId: 'anlageV',
        title: `Anlage V (${rental.properties.length}×)`,
        subtitle: 'Einkünfte aus Vermietung und Verpachtung',
        rows: rentalRows,
      })
    }
  }

  // 8. Anlage R (Rente)
  const pension = pensionQuery.data?.status === 200 ? pensionQuery.data.data : null
  const pensionB = pensionBQuery.data?.status === 200 ? pensionBQuery.data.data : null
  const renteRows: GlassFormRow[] = []
  if (pension?.jahresbetrag.kind === 'erfasst' && pension.jahresbetrag.value !== undefined) {
    renteRows.push({
      id: 'rente-a',
      line: 'Zeilen 4–10',
      label: 'Jahresbetrag Rente (Person A)',
      value: formatEuro(pension.jahresbetrag.value),
      person: 'A',
      provenanceLabel: prov('rente', 'jahresbetrag'),
      screen: 'rente',
      field: 'jahresbetrag',
    })
  }
  if (isJoint && pensionB?.jahresbetrag.kind === 'erfasst' && pensionB.jahresbetrag.value !== undefined) {
    renteRows.push({
      id: 'rente-b',
      line: 'Zeilen 4–10 (Person B)',
      label: `Jahresbetrag Rente (${partnerName})`,
      value: formatEuro(pensionB.jahresbetrag.value),
      person: 'B',
      provenanceLabel: prov('rente', 'jahresbetrag'),
      screen: 'rente',
      field: 'jahresbetrag',
    })
  }
  if (renteRows.length > 0) {
    sections.push({
      formId: 'anlageR',
      title: 'Anlage R',
      subtitle: 'Renten und andere Leistungen',
      rows: renteRows,
    })
  }

  // 9. Haushaltsnahe Aufwendungen & Außergewöhnliche Belastungen
  const haushaltRows: GlassFormRow[] = []
  const handwerker = amountFromAnswer(answers['haushalt-handwerker-betrag'])
  const dienstleistung = amountFromAnswer(answers['haushalt-dienstleistung-betrag'])
  const minijob = amountFromAnswer(answers['haushalt-minijob-betrag'])
  const krankheit = amountFromAnswer(answers['gesundheit-betrag'])

  if (handwerker !== null && handwerker > 0) {
    haushaltRows.push({
      id: 'haushalt-handwerker',
      line: 'Haushalt Zeile 6 (Kz 212)',
      label: 'Handwerkerleistungen (Arbeitskosten, 20 % Steuerermäßigung)',
      value: formatEuro(handwerker),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'haushalt-handwerker-betrag'),
      screen: 'interview',
      field: 'haushalt-handwerker-betrag',
    })
  }
  if (dienstleistung !== null && dienstleistung > 0) {
    haushaltRows.push({
      id: 'haushalt-dienstleistung',
      line: 'Haushalt Zeile 5 (Kz 210)',
      label: 'Haushaltsnahe Dienstleistungen (20 % Steuerermäßigung)',
      value: formatEuro(dienstleistung),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'haushalt-dienstleistung-betrag'),
      screen: 'interview',
      field: 'haushalt-dienstleistung-betrag',
    })
  }
  if (minijob !== null && minijob > 0) {
    haushaltRows.push({
      id: 'haushalt-minijob',
      line: 'Haushalt Zeile 4 (Kz 202)',
      label: 'Geringfügige Beschäftigung im Haushalt (Minijob)',
      value: formatEuro(minijob),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'haushalt-minijob-betrag'),
      screen: 'interview',
      field: 'haushalt-minijob-betrag',
    })
  }
  if (krankheit !== null && krankheit > 0) {
    haushaltRows.push({
      id: 'agb-krankheit',
      line: 'Anlage agB Zeile 13',
      label: 'Krankheitskosten (außergewöhnliche Belastungen)',
      value: formatEuro(krankheit),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'gesundheit-betrag'),
      screen: 'interview',
      field: 'gesundheit-betrag',
    })
  }
  if (haushaltRows.length > 0) {
    sections.push({
      formId: 'haushaltAgb',
      title: 'Anlage Haushaltsnahe Aufwendungen & Außerg. Belastungen',
      subtitle: 'Steuerermäßigungen nach § 35a EStG & Krankheitskosten (§ 33 EStG)',
      rows: haushaltRows,
    })
  }

  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0)
  const visibleSections =
    activeFilter === 'alle' ? sections : sections.filter((s) => s.formId === activeFilter)

  const liveAcroValues: Record<string, string | true> = {
    'est1a.einkommensteuererklaerung': true,
  }
  if (md) {
    if (md.strasse) liveAcroValues['est1a.strasse'] = md.strasse
    if (md.hausnummer) liveAcroValues['est1a.hausnummer'] = md.hausnummer
    if (md.hausnummerZusatz) liveAcroValues['est1a.hausnummerZusatz'] = md.hausnummerZusatz
    if (md.plz) liveAcroValues['est1a.plz'] = md.plz
    if (md.wohnort) liveAcroValues['est1a.wohnort'] = md.wohnort
    if (md.beruf) liveAcroValues['est1a.beruf'] = md.beruf
    if (md.religion) liveAcroValues['est1a.religion'] = md.religion
    if (md.finanzamt) liveAcroValues['est1a.finanzamt'] = md.finanzamt
    if (md.iban) {
      if (md.iban.toUpperCase().startsWith('DE')) {
        liveAcroValues['est1a.ibanInland'] = md.iban.slice(2).replace(/\s+/g, '')
      } else {
        liveAcroValues['est1a.ibanAusland'] = md.iban
      }
    }
  }
  if (isJoint) {
    liveAcroValues['est1a.zusammenveranlagung'] = true
    if (linkData?.personB?.firstName) liveAcroValues['est1a.vornameB'] = linkData.personB.firstName
    if (linkData?.personB?.lastName) liveAcroValues['est1a.nameB'] = linkData.personB.lastName
    if (linkData?.personB?.steuerId) liveAcroValues['est1a.idnrB'] = linkData.personB.steuerId
    if (linkData?.personB?.beruf) liveAcroValues['est1a.berufB'] = linkData.personB.beruf
    if (linkData?.personB?.religion) liveAcroValues['est1a.religionB'] = linkData.personB.religion
  }
  if (lstb?.bruttoarbeitslohn.kind === 'erfasst' && lstb.bruttoarbeitslohn.value !== undefined) {
    liveAcroValues['anlN.personA'] = true
    liveAcroValues['anlN.kz110'] = String(Math.round(lstb.bruttoarbeitslohn.value))
  }
  if (lstb?.lohnsteuer.kind === 'erfasst' && lstb.lohnsteuer.value !== undefined) {
    liveAcroValues['anlN.kz140'] = String(Math.round(lstb.lohnsteuer.value))
  }
  if (commute?.inputs) {
    if (commute.inputs.workplace) liveAcroValues['anlN.wegOrt'] = commute.inputs.workplace
    if (commute.inputs.oneWayKm != null && commute.inputs.oneWayKm > 0) liveAcroValues['anlN.kz111'] = String(commute.inputs.oneWayKm)
    if (commute.workdays?.commuteDays) liveAcroValues['anlN.kz110Tage'] = String(commute.workdays.commuteDays)
  }
  if (chGrossA?.kind === 'erfasst' && chGrossA.value !== undefined) {
    liveAcroValues['anlNGre.personA'] = true
    liveAcroValues['anlNGre.z6Chf'] = String(Math.round(chGrossA.value))
  }
  if (chQstA?.kind === 'erfasst' && chQstA.value !== undefined) {
    liveAcroValues['anlNGre.kz169'] = String(Math.round(chQstA.value))
  }
  if (chAhvA?.kind === 'erfasst' && chAhvA.value !== undefined) {
    liveAcroValues['anlNGre.z82Chf'] = String(Math.round(chAhvA.value))
  }
  if (cap?.kapitalertraege.kind === 'erfasst' && cap.kapitalertraege.value !== undefined) {
    liveAcroValues['anlKap.personA'] = true
    liveAcroValues['anlKap.kz210'] = String(Math.round(cap.kapitalertraege.value))
  }
  if (pension?.jahresbetrag.kind === 'erfasst' && pension.jahresbetrag.value !== undefined) {
    liveAcroValues['anlR.personA'] = true
    liveAcroValues['anlR.kz101'] = String(Math.round(pension.jahresbetrag.value))
  }
  if (kinderData && kinderData.kinder.length > 0 && kinderData.kinder[0]) {
    const firstChild = kinderData.kinder[0]
    if (firstChild.firstName) liveAcroValues['anlKind.vorname'] = firstChild.firstName
    if (firstChild.lastName) liveAcroValues['anlKind.name'] = firstChild.lastName
    if (firstChild.taxId) liveAcroValues['anlKind.idnr'] = firstChild.taxId
  }
  if (rental && rental.properties.length > 0 && rental.properties[0]) {
    const firstRental = rental.properties[0]
    if (firstRental.strasse) liveAcroValues['anlV.strasse'] = firstRental.strasse
    if (firstRental.plz) liveAcroValues['anlV.plz'] = firstRental.plz
    if (firstRental.city) liveAcroValues['anlV.ort'] = firstRental.city
  }

  return (
    <View style={styles.container} testID="glass-form-preview">
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>
            {tr('ausdruck.glasErklaerung.titel', '🔍 Glas-Erklärung: Amtliche Formular-Vorschau')}
          </Text>
          <Text style={styles.subheading}>
            {totalRows > 0
              ? `${sections.length} Vordrucke · ${totalRows} befüllte Formularzeilen · Tipp auf eine Zeile öffnet die Eingabemaske`
              : tr(
                  'ausdruck.glasErklaerung.leer',
                  'Noch keine Formularzeilen befüllt. Sobald du Angaben im Strom, in den Masken oder über die Eule machst, erscheinen sie hier.',
                )}
          </Text>
        </View>
        <View style={styles.filterRow}>
          <Chip active={viewMode === 'zeilen'} onPress={() => onChangeViewMode('zeilen')}>
            📋 Strukturierte Zeilen
          </Chip>
          <Chip active={viewMode === 'acroform'} onPress={() => onChangeViewMode('acroform')}>
            📄 Original-Vordruck (AcroForm HD)
          </Chip>
          {onCollapse ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCollapse}
              style={styles.toggleButton}
              testID="glass-form-preview-collapse"
            >
              <Text style={styles.toggleButtonText}>
                {tr('ausdruck.glasErklaerung.schliessen', 'Einklappen ▲')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {viewMode === 'acroform' ? (
        <AcroFormLiveViewer
          year={year}
          initialForm={initialAcroForm}
          liveValues={liveAcroValues}
          highlightedFieldId={highlightedAcroFieldId}
          loader={acroFormLoader}
          onInspectField={onInspectField}
          onSaveAcroField={handleSaveAcroField}
        />
      ) : null}

      {sections.length > 1 ? (
        <View style={styles.filterRow} testID="glass-form-filter-row">
          <Chip
            active={activeFilter === 'alle'}
            onPress={() => onSelectFilter('alle')}
            testID="glass-filter-alle"
          >
            {`Alle (${totalRows})`}
          </Chip>
          {sections.map((sec) => (
            <Chip
              key={sec.formId}
              active={activeFilter === sec.formId}
              onPress={() => onSelectFilter(sec.formId)}
              testID={`glass-filter-${sec.formId}`}
            >
              {`${sec.title} (${sec.rows.length})`}
            </Chip>
          ))}
        </View>
      ) : null}

      {visibleSections.map((section) => (
        <Card key={section.formId} style={styles.sectionCard} testID={`glass-section-${section.formId}`}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{`${section.rows.length} Zeilen`}</Text>
          </View>
          <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>

          <View style={styles.rowList}>
            {section.rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole={onInspectField ? 'button' : 'text'}
                disabled={!onInspectField}
                onPress={
                  onInspectField
                    ? () => onInspectField(row.screen, row.field, row.person === 'B' ? 'B' : 'A')
                    : undefined
                }
                style={styles.rowItem}
                testID={`glass-row-${row.id}`}
              >
                <View style={styles.rowTop}>
                  <View style={styles.linePill}>
                    <Text style={styles.linePillText}>{row.line}</Text>
                  </View>
                  {row.person === 'B' ? (
                    <View style={styles.personPill}>
                      <Text style={styles.personPillText}>{partnerName}</Text>
                    </View>
                  ) : row.person === 'gemeinsam' ? (
                    <View style={styles.personPill}>
                      <Text style={styles.personPillText}>Gemeinsam</Text>
                    </View>
                  ) : null}
                  <Text style={styles.provenanceBadge}>{row.provenanceLabel}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowValue}>{row.value}</Text>
                </View>
                {onInspectField ? (
                  <Text style={styles.jumpHint}>Zur Eingabemaske springen →</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const collapsedCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    padding: t.space.s3,
  }
  const collapsedHeader: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const collapsedTitle: TextStyle = {
    ...t.type.itemTitle,
    color: t.color.tinte,
  }
  const collapsedSubtitle: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginTop: 2,
  }
  const container: ViewStyle = {
    marginBottom: t.space.s4,
    gap: t.space.s3,
  }
  const headerRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const heading: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const subheading: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginTop: 2,
  }
  const toggleButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderRadius: t.radius.pille,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
  }
  const toggleButtonText: TextStyle = {
    ...t.type.label,
    color: t.color.tinte,
  }
  const filterRow: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const sectionCard: ViewStyle = {
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    padding: t.space.s3,
  }
  const sectionHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s2,
  }
  const sectionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    flex: 1,
  }
  const sectionCount: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
  }
  const sectionSubtitle: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginBottom: t.space.s3,
  }
  const rowList: ViewStyle = {
    gap: t.space.s2,
  }
  const rowItem: ViewStyle = {
    padding: t.space.s2,
    borderRadius: t.radius.s,
    borderWidth: 1,
    borderColor: t.color.linieWeich,
    backgroundColor: t.color.grund,
    gap: 4,
  }
  const rowTop: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const linePill: ViewStyle = {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.funkeWeich,
  }
  const linePillText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte,
    fontWeight: '700',
  }
  const personPill: ViewStyle = {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: t.radius.pille,
    borderWidth: 1,
    borderColor: t.color.linie,
  }
  const personPillText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
  }
  const provenanceBadge: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
    marginLeft: 'auto',
  }
  const rowMain: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const rowLabel: TextStyle = {
    ...t.type.body,
    color: t.color.tinte,
    flex: 1,
  }
  const rowValue: TextStyle = {
    ...t.type.bodyStrong,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
  }
  const jumpHint: TextStyle = {
    ...t.type.meta,
    color: t.color.funkeTinte,
  }

  return {
    collapsedCard,
    collapsedHeader,
    collapsedTitle,
    collapsedSubtitle,
    container,
    headerRow,
    heading,
    subheading,
    toggleButton,
    toggleButtonText,
    filterRow,
    sectionCard,
    sectionHeader,
    sectionTitle,
    sectionCount,
    sectionSubtitle,
    rowList,
    rowItem,
    rowTop,
    linePill,
    linePillText,
    personPill,
    personPillText,
    provenanceBadge,
    rowMain,
    rowLabel,
    rowValue,
    jumpHint,
  }
}
