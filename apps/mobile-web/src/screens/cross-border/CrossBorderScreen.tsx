import { useState, useRef } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Input, Feld, Option, Pill, useTheme, useBreakpoint, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { ANNUAL_AVERAGE_RATES, ENTRIES, SALARY_CERTIFICATE_FIELDS, formatEuro, nextStepFor, type Answers, type EntryQuestionId } from '@steuereule/core'
import {
  CreateReceiptDtoKind,
  getReceiptControllerListQueryKey,
  uploadReceiptFile,
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useChSalaryCertificateControllerGet,
  useChSalaryCertificateControllerSetField,
  useChSalaryCertificateControllerSetNGre,
  useChSalaryCertificateControllerSetProvision,
  useChSalaryCertificateControllerSetExchangeRate,
  useChSalaryCertificateControllerSetCrossBorderFacts,
  getChSalaryCertificateControllerGetQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getTaxEstimateControllerGetQueryKey,
  type ChSalaryCertificateResponseDto,
  type PutSalaryCertificateFieldDto,
  type NGreDetailsDto,
  type PutNGreDto,
  type PutProvisionDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { triggerSaveErrorHaptic, watchSaveResult } from '../shared/saveFeedback'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import { detectDocumentMimeType } from '../../lib/documentOcr'
import { AddressSearch } from '../shared/AddressSearch'
import { useSavedEmployers } from '../master-data/employersStore'

export interface CrossBorderScreenProps {
  readonly onDone: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's Swiss figures (ADR-0054, partner without an own account). */
  readonly partnerName?: string
}

const SEGMENT_CH = ENTRIES['segment-ch']

/** The exchange rate is the official rate of one month of the tax year, or the annual average — picked, not typed. */
const MONTH_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const

/** Ziffern 1–7 of the Swiss Lohnausweis sum up to Ziffer 8 (Bruttolohn total / AHV). */
const GROSS_COMPONENT_IDS = [
  'lohn',
  'gehaltsnebenleistungen',
  'unregelmaessige-leistungen',
  'kapitalleistungen',
  'beteiligungsrechte',
  'sitzungsgelder',
  'andere-leistungen',
] as const

export function CrossBorderScreen({ onDone, onBack, taxYear = CURRENT_TAX_YEAR, partnerName }: CrossBorderScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const forPartner = partnerName !== undefined
  const params = forPartner ? ({ person: 'B' } as const) : undefined
  // The user's Grenzgänger questions are interview answers; the partner's are saved with B's mask.
  const interviewQuery = useInterviewControllerGetInterview(taxYear, { eintrag: 'segment-ch' }, { query: { enabled: !forPartner } })
  const salaryCertificateQuery = useChSalaryCertificateControllerGet(taxYear, params)
  const setCrossBorderFacts = useChSalaryCertificateControllerSetCrossBorderFacts()
  const [partnerResidence, setPartnerResidence] = useState<'Deutschland' | 'Schweiz' | null>(null)
  const postAnswer = useInterviewControllerPostAnswer()
  const setField = useChSalaryCertificateControllerSetField()
  const setExchangeRate = useChSalaryCertificateControllerSetExchangeRate()
  const setNGre = useChSalaryCertificateControllerSetNGre()
  const setProvision = useChSalaryCertificateControllerSetProvision()

  const [interviewAnswers, setInterviewAnswers] = useState<Answers>({})
  const [seeded, setSeeded] = useState(false)
  const { track, flushThen: finish, saveFailed } = usePendingMutations()
  // The CH answers depend on each other (Tage is only reachable after Wohnsitz): posting them in
  // parallel let the second one overtake the first and come back 409 ANSWER_UNREACHABLE.
  const answerQueue = useRef<Promise<unknown>>(Promise.resolve())

  function invalidateCertificate(): void {
    void queryClient.invalidateQueries({ queryKey: getChSalaryCertificateControllerGetQueryKey(taxYear, params) })
    void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
  }

  if (!seeded && interviewQuery.data?.status === 200) {
    setInterviewAnswers(interviewQuery.data.data.answers as Answers)
    setSeeded(true)
  }

  const interviewPending = !forPartner && interviewQuery.isPending
  const interviewFailed = !forPartner && (interviewQuery.isError || interviewQuery.data?.status !== 200)
  if (interviewPending || salaryCertificateQuery.isPending) {
    return <LoadingState bp={bp} label={tr('grenzgaenger.loading')} />
  }
  if (interviewFailed || salaryCertificateQuery.isError || salaryCertificateQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('grenzgaenger.loadError.heading')}
        message={tr('grenzgaenger.loadError.message')}
        retryLabel={tr('grenzgaenger.loadError.retry')}
        onRetry={() => {
          void interviewQuery.refetch()
          void salaryCertificateQuery.refetch()
        }}
      />
    )
  }

  const salaryCertificate = salaryCertificateQuery.data.data
  const step = forPartner
    ? salaryCertificate.status === null
      ? ({ kind: 'question', id: partnerResidence === null ? 'ch-wohnsitz' : 'ch-nichtrueckkehrtage' } as const)
      : null
    : seeded
      ? nextStepFor(SEGMENT_CH, interviewAnswers)
      : null

  function answerForPartner(questionId: EntryQuestionId, value: string) {
    if (questionId === 'ch-wohnsitz') {
      setPartnerResidence(value === 'Schweiz' ? 'Schweiz' : 'Deutschland')
      return
    }
    const residence = partnerResidence ?? 'Deutschland'
    track(
      watchSaveResult(
        setCrossBorderFacts.mutateAsync({ jahr: taxYear, data: { residence, daysWithoutReturn: Number(value) }, params: { person: 'B' } }),
      ).then(invalidateCertificate),
    )
  }

  function answer(questionId: EntryQuestionId, value: string) {
    const previous = interviewAnswers
    setInterviewAnswers((a) => ({ ...a, [questionId]: value }))
    const post = answerQueue.current.then(() => postAnswer.mutateAsync({ jahr: taxYear, data: { questionId, value } }))
    answerQueue.current = post.catch(() => {})
    track(
      post.then(
        (response) => {
          if (response.status === 200) {
            invalidateCertificate()
            void queryClient.invalidateQueries({
              queryKey: getInterviewControllerGetInterviewQueryKey(taxYear),
              exact: true,
            })
            void queryClient.invalidateQueries({
              queryKey: getInterviewControllerGetInterviewQueryKey(taxYear, { eintrag: 'segment-ch' }),
              refetchType: 'none',
            })
            return
          }
          setInterviewAnswers(previous)
          setSeeded(false)
          triggerSaveErrorHaptic()
          void interviewQuery.refetch()
        },
        () => {
          triggerSaveErrorHaptic()
          setInterviewAnswers(previous)
        },
      ),
    )
  }

  if (step !== null && step.kind === 'question') {
    return (
      <ChInterviewStep
        stepId={step.id}
        onAnswer={forPartner ? answerForPartner : answer}
        bp={bp}
        onBack={() => (forPartner && partnerResidence !== null ? setPartnerResidence(null) : finish(onBack ?? onDone))}
        {...(partnerName !== undefined ? { partnerName } : {})}
      />
    )
  }

  return (
    <>
      <SaveFailedNotice visible={saveFailed} />
      <SalaryCertificateStep
        salaryCertificate={salaryCertificate}
        taxYear={taxYear}
        {...(partnerName !== undefined ? { partnerName } : {})}
        onSetField={(vars) => track(watchSaveResult(setField.mutateAsync({ ...vars, ...(params ? { params } : {}) })).then(invalidateCertificate))}
        onSetExchangeRate={(vars) => track(watchSaveResult(setExchangeRate.mutateAsync({ ...vars, ...(params ? { params } : {}) })).then(invalidateCertificate))}
        onSetProvision={(data) => track(watchSaveResult(setProvision.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) })).then(invalidateCertificate))}
        onSetNGre={(data) => track(watchSaveResult(setNGre.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) })).then(invalidateCertificate))}
        onDone={() => finish(onDone)}
        {...(onBack ? { onBack: () => finish(onBack) } : {})}
        bp={bp}
      />
    </>
  )
}

function ChInterviewStep({
  stepId,
  onAnswer,
  bp,
  onBack,
  partnerName,
}: {
  readonly stepId: EntryQuestionId
  readonly onAnswer: (id: EntryQuestionId, value: string) => void
  readonly bp: Breakpoint
  readonly onBack: () => void
  readonly partnerName?: string
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  if (stepId === 'ch-wohnsitz') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
        <View style={styles.headerRow}>
          <BackButton accessibilityLabel={tr('grenzgaenger.back')} onPress={onBack} />
        </View>
        <Text style={styles.heading}>
          {tr('grenzgaenger.interview.wohnsitz.titleBefore')}
          <Text style={styles.mark}>{tr('grenzgaenger.interview.wohnsitz.titleMark')}</Text>
          {tr('grenzgaenger.interview.wohnsitz.titleAfter')}
        </Text>
        {partnerName !== undefined ? <Text style={styles.help} testID="ch-partner-hinweis">{tr('grenzgaenger.partnerFor', { name: partnerName })}</Text> : null}
        <Text style={styles.help}>{tr('grenzgaenger.interview.wohnsitz.help')}</Text>
        <Option onPress={() => onAnswer('ch-wohnsitz', 'Deutschland')} testID="ch-wohnsitz-deutschland">{tr('grenzgaenger.interview.wohnsitz.deutschland')}</Option>
        <Option onPress={() => onAnswer('ch-wohnsitz', 'Schweiz')} testID="ch-wohnsitz-schweiz">{tr('grenzgaenger.interview.wohnsitz.schweiz')}</Option>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        <BackButton accessibilityLabel={tr('grenzgaenger.back')} onPress={onBack} />
      </View>
      <Text style={styles.heading}>
        {tr('grenzgaenger.interview.tage.titleBefore')}
        <Text style={styles.mark}>{tr('grenzgaenger.interview.tage.titleMark')}</Text>
        {tr('grenzgaenger.interview.tage.titleAfter')}
      </Text>
      {partnerName !== undefined ? <Text style={styles.help} testID="ch-partner-hinweis">{tr('grenzgaenger.partnerFor', { name: partnerName })}</Text> : null}
      <Text style={styles.help}>{tr('grenzgaenger.interview.tage.help')}</Text>
      <DaysInput onAnswer={onAnswer} />
    </ScrollView>
  )
}

function DaysInput({ onAnswer }: { readonly onAnswer: (id: EntryQuestionId, value: string) => void }) {
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState('')
  const valid = /^(0|[1-9]\d*)$/.test(text) && Number(text) <= 365
  return (
    <View>
      <Feld label={tr('grenzgaenger.interview.tage.label')}>
        <Input
          type="numeric"
          value={text}
          onChange={setText}
          placeholder={tr('grenzgaenger.interview.tage.placeholder')}
          accessibilityLabel={tr('grenzgaenger.interview.tage.label')}
          onSubmit={() => {
            if (valid) onAnswer('ch-nichtrueckkehrtage', text)
          }}
          testID="ch-tage-input"
        />
      </Feld>
      <Button disabled={!valid} onPress={() => onAnswer('ch-nichtrueckkehrtage', text)} testID="ch-tage-weiter">
        {tr('grenzgaenger.weiter')}
      </Button>
    </View>
  )
}

function SalaryCertificateStep({
  salaryCertificate,
  taxYear,
  onSetField,
  onSetExchangeRate,
  onSetNGre,
  onSetProvision,
  onDone,
  onBack,
  bp,
  partnerName,
}: {
  readonly salaryCertificate: ChSalaryCertificateResponseDto
  readonly taxYear: number
  readonly partnerName?: string
  readonly onSetField: (vars: Parameters<ReturnType<typeof useChSalaryCertificateControllerSetField>['mutate']>[0]) => void
  readonly onSetExchangeRate: (vars: Parameters<ReturnType<typeof useChSalaryCertificateControllerSetExchangeRate>['mutate']>[0]) => void
  readonly onSetNGre: (data: PutNGreDto) => void
  readonly onSetProvision: (data: PutProvisionDto) => void
  readonly onDone: () => void
  readonly onBack?: () => void
  readonly bp: Breakpoint
}) {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const styles = makeStyles(t)
  const [month, setMonth] = useState(salaryCertificate.exchangeRate?.month ?? '')
  const [rateError, setRateError] = useState(false)
  const [rate, setRate] = useState(
    salaryCertificate.exchangeRate !== null && salaryCertificate.exchangeRate !== undefined ? String(salaryCertificate.exchangeRate.rate) : '',
  )

  const amountFields = SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag')
  const foldStatus = salaryCertificate.foldStatus
  const status = salaryCertificate.status

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of amountFields) {
      initial[field.id] = valueFromResponse(salaryCertificate, field.id)
    }
    return initial
  })
  const [manualGrossOverride, setManualGrossOverride] = useState(false)
  const [missingDrawerOpen, setMissingDrawerOpen] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [receiptUploadStatus, setReceiptUploadStatus] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null)

  const grossComponentValues = GROSS_COMPONENT_IDS.map((id) => integerFrom(drafts[id]?.trim() ?? '')).filter(
    (v): v is number => v !== null && v > 0,
  )
  const calculatedGrossSum = grossComponentValues.reduce((acc, n) => acc + n, 0)
  const currentGrossInt = integerFrom(drafts['bruttolohn-total']?.trim() ?? '')

  // Required fields for the calculation fold: Ziffer 8, Ziffer 10, Ziffer 12 (when echter Grenzgänger), and Wechselkurs.
  const requiredFieldDefs: ReadonlyArray<{ readonly id: string; readonly label: string; readonly open: boolean }> = [
    {
      id: 'bruttolohn-total',
      label: `Ziff. 8 · ${tr('grenzgaenger.lohnausweis.felder.bruttolohn-total')}`,
      open: currentGrossInt === null && calculatedGrossSum === 0,
    },
    {
      id: 'berufliche-vorsorge',
      label: `Ziff. 10 · ${tr('grenzgaenger.lohnausweis.felder.berufliche-vorsorge')}`,
      open: integerFrom(drafts['berufliche-vorsorge']?.trim() ?? '') === null,
    },
    ...(status !== 'kein-grenzgaenger'
      ? [
          {
            id: 'quellensteuer',
            label: `Ziff. 12 · ${tr('grenzgaenger.lohnausweis.felder.quellensteuer')}`,
            open: integerFrom(drafts['quellensteuer']?.trim() ?? '') === null,
          },
        ]
      : []),
    {
      id: 'wechselkurs',
      label: tr('grenzgaenger.lohnausweis.wechselkurs.title'),
      open: salaryCertificate.exchangeRate === null && rate.trim() === '',
    },
  ]
  const openRequiredFields = requiredFieldDefs.filter((f) => f.open)

  function handleFieldTextChange(fieldId: string, nextText: string) {
    setDrafts((prev) => {
      const next = { ...prev, [fieldId]: nextText }
      if (fieldId === 'bruttolohn-total') {
        setManualGrossOverride(nextText.trim() !== '')
        return next
      }
      if (fieldId !== 'lohn' && (GROSS_COMPONENT_IDS as readonly string[]).includes(fieldId) && !manualGrossOverride) {
        const sum = GROSS_COMPONENT_IDS.reduce((acc, id) => {
          const v = integerFrom((id === fieldId ? nextText : next[id] ?? '').trim())
          return acc + (v !== null && v > 0 ? v : 0)
        }, 0)
        if (sum > 0) {
          next['bruttolohn-total'] = String(sum)
        }
      }
      return next
    })
  }

  function applyCalculatedGrossSum() {
    if (calculatedGrossSum <= 0) return
    setManualGrossOverride(false)
    setDrafts((prev) => ({ ...prev, 'bruttolohn-total': String(calculatedGrossSum) }))
    onSetField({ jahr: taxYear, feld: 'bruttolohn-total', data: { kind: 'erfasst', value: calculatedGrossSum } })
  }

  async function handleReceiptFile(file: File) {
    setReceiptUploadStatus(null)
    const detectedMime = detectDocumentMimeType(new Uint8Array(0), file.type, file.name)
    if (detectedMime === null) {
      triggerSaveErrorHaptic()
      setReceiptUploadStatus({ kind: 'error', text: tr('belege.upload.errorUnsupported') })
      return
    }
    setUploadingReceipt(true)
    try {
      const result = await uploadReceiptFile({
        file,
        fileName: file.name,
        kind: CreateReceiptDtoKind.Lohnausweis,
      })
      if (!result.ok) {
        triggerSaveErrorHaptic()
        setReceiptUploadStatus({ kind: 'error', text: tr('belege.upload.errorFailed') })
        return
      }
      setReceiptUploadStatus({ kind: 'ok', text: `${file.name} gespeichert & im Belege-Tab verknüpft.` })
      void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
    } catch {
      triggerSaveErrorHaptic()
      setReceiptUploadStatus({ kind: 'error', text: tr('belege.upload.errorFailed') })
    } finally {
      setUploadingReceipt(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('grenzgaenger.back')} onPress={onBack} /> : <BackButtonSpacer />}
        <Text style={styles.heading}>{tr('grenzgaenger.lohnausweis.title')}</Text>
      </View>
      {partnerName !== undefined ? <Text style={styles.help} testID="ch-partner-hinweis">{tr('grenzgaenger.partnerFor', { name: partnerName })}</Text> : null}
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.help')}</Text>

      <Card style={styles.uploadCard} testID="ch-lohnausweis-upload-card">
        <View style={styles.uploadHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadTitle}>Lohnausweis oder Gre-1 / Gre-2 ablegen</Text>
            <Text style={styles.uploadBody}>
              Lade deinen Schweizer Lohnausweis direkt hier hoch – er landet automatisch im Belege-Ordner ({taxYear}) und steht der Eule im Chat bereit.
            </Text>
          </View>
          <ReceiptPickerButton
            onFile={(file) => void handleReceiptFile(file)}
            disabled={uploadingReceipt}
            variant="leise"
            testID="ch-lohnausweis-upload-btn"
          >
            {uploadingReceipt ? tr('belege.upload.uploading') : 'Beleg auswählen'}
          </ReceiptPickerButton>
        </View>
        {receiptUploadStatus !== null ? (
          <Text
            style={receiptUploadStatus.kind === 'ok' ? styles.uploadStatusOk : styles.uploadStatusError}
            accessibilityLiveRegion="polite"
            testID="ch-lohnausweis-upload-status"
          >
            {receiptUploadStatus.text}
          </Text>
        ) : null}
      </Card>

      {openRequiredFields.length > 0 ? (
        <Card style={styles.missingFieldsCard} testID="ch-offene-pflichtfelder-banner">
          <Pressable
            accessibilityRole="button"
            onPress={() => setMissingDrawerOpen((o) => !o)}
            style={styles.missingHeaderRow}
            testID="ch-offene-pflichtfelder-toggle"
          >
            <Text style={styles.missingBadgeText}>
              {`! ${openRequiredFields.length} ${openRequiredFields.length === 1 ? 'Pflichtangabe fehlt noch' : 'Pflichtangaben fehlen noch'}`}
            </Text>
            <Text style={styles.missingChipText}>{missingDrawerOpen ? 'Ausblenden ▲' : 'Welche fehlen? ▼'}</Text>
          </Pressable>
          {missingDrawerOpen ? (
            <View style={styles.missingChipsRow}>
              {openRequiredFields.map((item) => (
                <View key={item.id} style={styles.missingChip} testID={`ch-offen-chip-${item.id}`}>
                  <Text style={styles.missingChipText}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {amountFields.map((field) => {
        const isRequired = field.itemsRelevant && (field.id !== 'quellensteuer' || status !== 'kein-grenzgaenger')
        return (
          <View key={field.id}>
            {field.id === 'bruttolohn-total' && calculatedGrossSum > 0 ? (
              <View style={styles.liveSumBanner} testID="ch-bruttolohn-summe-banner">
                <Text style={styles.liveSumText}>
                  {`∑ Automatische Summe (Ziff. 1–7): ${calculatedGrossSum.toLocaleString('de-DE')} CHF`}
                </Text>
                {currentGrossInt !== calculatedGrossSum ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={applyCalculatedGrossSum}
                    style={styles.liveSumApplyBtn}
                    testID="ch-bruttolohn-summe-uebernehmen"
                  >
                    <Text style={styles.liveSumApplyText}>Summe übernehmen</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <ChFieldInput
              fieldId={field.id}
              digit={field.digit}
              required={isRequired}
              value={drafts[field.id] ?? ''}
              initial={valueFromResponse(salaryCertificate, field.id)}
              onChangeText={(next) => handleFieldTextChange(field.id, next)}
              onCommit={(value) => {
                onSetField({ jahr: taxYear, feld: field.id, data: value })
                // When an additional allowance (Ziffer 2–7) is committed and Ziffer 8 wasn't manually overridden, persist the live sum to Ziffer 8 too.
                if (
                  field.id !== 'lohn' &&
                  (GROSS_COMPONENT_IDS as readonly string[]).includes(field.id) &&
                  !manualGrossOverride &&
                  calculatedGrossSum > 0
                ) {
                  onSetField({ jahr: taxYear, feld: 'bruttolohn-total', data: { kind: 'erfasst', value: calculatedGrossSum } })
                }
              }}
            />
          </View>
        )
      })}

      <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.wechselkurs.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.wechselkurs.help')}</Text>
      <Feld label={tr('grenzgaenger.lohnausweis.wechselkurs.monat')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }} testID="ch-wechselkurs-monat">
          <Chip
            active={month === String(taxYear)}
            onPress={() => {
              setMonth(String(taxYear))
              const known = ANNUAL_AVERAGE_RATES[taxYear]
              if (known !== undefined) setRate(String(known).replace('.', ','))
            }}
            testID="ch-wechselkurs-jahresdurchschnitt"
          >
            {tr('grenzgaenger.lohnausweis.wechselkurs.jahresdurchschnitt')}
          </Chip>
          {MONTH_NUMBERS.map((number) => {
            const value = `${taxYear}-${number}`
            return (
              <Chip key={number} active={month === value} onPress={() => setMonth(value)} testID={`ch-wechselkurs-monat-${number}`}>
                {new Date(Date.UTC(taxYear, Number(number) - 1, 1)).toLocaleString(i18n.language, { month: 'short', timeZone: 'UTC' })}
              </Chip>
            )
          })}
        </View>
      </Feld>
      <Feld label={tr('grenzgaenger.lohnausweis.wechselkurs.kurs')}>
        <Input type="numeric" value={rate} onChange={setRate} placeholder="1,07" accessibilityLabel={tr('grenzgaenger.lohnausweis.wechselkurs.kurs')} testID="ch-wechselkurs-kurs" />
      </Feld>
      {month === String(taxYear) && ANNUAL_AVERAGE_RATES[taxYear] !== undefined ? (
        <Text style={styles.help}>
          {tr('grenzgaenger.lohnausweis.wechselkurs.jahresdurchschnittHinweis', {
            jahr: taxYear,
            eur: (ANNUAL_AVERAGE_RATES[taxYear]! * 100).toFixed(2).replace('.', ','),
          })}
        </Text>
      ) : null}
      {rateError ? <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.wechselkurs.fehlt')}</Text> : null}
      <Button
        variant="ghost"
        testID="ch-wechselkurs-speichern"
        onPress={() => {
          const n = Number(rate.trim().replace(',', '.'))
          const annual = month === String(taxYear)
          const valid = (annual || /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) && Number.isFinite(n) && n > 0
          setRateError(!valid)
          if (valid) onSetExchangeRate({ jahr: taxYear, data: { month, rate: n, mode: annual ? 'jahresdurchschnitt' : 'amtlich' } })
        }}
      >
        {tr('grenzgaenger.lohnausweis.wechselkurs.speichern')}
      </Button>

      <ProvisionSection salaryCertificate={salaryCertificate} onSet={onSetProvision} />

      <NGreSection nGre={salaryCertificate.nGre} onSet={onSetNGre} />

      {status !== null ? (
        <Card variant="default" style={styles.statusCard}>
          <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.status.label')}</Text>
          <Pill>{status === 'echter-grenzgaenger' ? tr('grenzgaenger.lohnausweis.status.echterGrenzgaenger') : tr('grenzgaenger.lohnausweis.status.keinGrenzgaenger')}</Pill>
        </Card>
      ) : (
        <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.status.offen')}</Text>
      )}

      {foldStatus !== null ? (
        <Card variant="default" style={styles.statusCard}>
          <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.stand.label')}</Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.einnahmen')}: {formatEuro(foldStatus.einnahmen)}
          </Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.vorsorgeaufwand')}: {formatEuro(foldStatus.vorsorgeaufwand)}
          </Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.anrechnung')}: {formatEuro(foldStatus.anrechnung)}
          </Text>
          {foldStatus.kind === 'offen' && foldStatus.openItems !== undefined ? (
            <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.stand.offen', { count: foldStatus.openItems })}</Text>
          ) : null}
        </Card>
      ) : null}

      <Button onPress={onDone} style={styles.cta} testID="ch-lohnausweis-weiter">
        {tr('grenzgaenger.lohnausweis.done')}
      </Button>
    </ScrollView>
  )
}

const N_GRE_TEXT_FIELDS = ['arbeitgeberName', 'arbeitgeberStrasse', 'arbeitgeberPlzOrt'] as const
const N_GRE_AMOUNT_FIELDS = [
  'familienzulagenChf',
  'steuerfreiesKrankentaggeldChf',
  'krankentaggeldChf',
  'pkArbeitnehmerChf',
  'pkArbeitgeberGesamtChf',
  'pkArbeitgeberChf',
] as const
/** Who pays the premium (N-Gre Zeilen 18/19, 95–98); the CHF field only matters when the employer pays it all. */
const PREMIUMS = [
  { prozent: 'krankentaggeldArbeitgeberProzent', chf: 'krankentaggeldArbeitgeberChf' },
  { prozent: 'nbuvArbeitgeberProzent', chf: 'nbuvArbeitgeberChf' },
] as const

function NGreSection({ nGre, onSet }: { readonly nGre: NGreDetailsDto; readonly onSet: (data: PutNGreDto) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { employers, addEmployer } = useSavedEmployers()
  const [employerText, setEmployerText] = useState<{
    readonly arbeitgeberName: string
    readonly arbeitgeberStrasse: string
    readonly arbeitgeberPlzOrt: string
  }>({
    arbeitgeberName: nGre.arbeitgeberName ?? '',
    arbeitgeberStrasse: nGre.arbeitgeberStrasse ?? '',
    arbeitgeberPlzOrt: nGre.arbeitgeberPlzOrt ?? '',
  })
  const [savedNotice, setSavedNotice] = useState(false)

  const plzMatch = /^(\d{4,5})/.exec(employerText.arbeitgeberPlzOrt.trim())
  const currentPostalCode = plzMatch ? plzMatch[1]! : ''

  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.nGre.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.nGre.help')}</Text>

      {employers.length > 0 ? (
        <View style={styles.employerPickerBox} testID="ch-ngre-arbeitgeber-auswahl">
          <Text style={styles.employerPickerLabel}>Gespeicherte Arbeitgeber aus deinem Profil übernehmen (Snapshot):</Text>
          <View style={styles.employerChipsRow}>
            {employers.map((emp) => (
              <Chip
                key={emp.id}
                active={employerText.arbeitgeberName === emp.name}
                onPress={() => {
                  setSavedNotice(false)
                  setEmployerText({
                    arbeitgeberName: emp.name,
                    arbeitgeberStrasse: emp.strasse,
                    arbeitgeberPlzOrt: emp.plzOrt,
                  })
                  onSet({
                    arbeitgeberName: emp.name,
                    arbeitgeberStrasse: emp.strasse,
                    arbeitgeberPlzOrt: emp.plzOrt,
                  })
                }}
                testID={`ch-ngre-arbeitgeber-chip-${emp.id}`}
              >
                {`${emp.name} (${emp.plzOrt})`}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}

      <AddressSearch
        postalCode={currentPostalCode}
        testIDPrefix="ch-ngre"
        onPick={(address) => {
          const streetLine = `${address.street}${address.houseNumber ? ` ${address.houseNumber}${address.houseNumberSuffix ?? ''}` : ''}`
          const cityLine = `${address.postalCode} ${address.city}`
          setEmployerText((prev) => ({
            ...prev,
            arbeitgeberStrasse: streetLine,
            arbeitgeberPlzOrt: cityLine,
          }))
          onSet({
            arbeitgeberStrasse: streetLine,
            arbeitgeberPlzOrt: cityLine,
          })
        }}
      />

      {N_GRE_TEXT_FIELDS.map((field) => (
        <NGreInput
          key={field}
          label={tr(`grenzgaenger.nGre.felder.${field}`)}
          initial={nGre[field] ?? ''}
          controlledValue={employerText[field]}
          onControlledChange={(val) => {
            setSavedNotice(false)
            setEmployerText((prev) => ({ ...prev, [field]: val }))
          }}
          testID={`ch-ngre-${field}`}
          onCommit={(text) => onSet({ [field]: text === '' ? null : text })}
        />
      ))}

      {employerText.arbeitgeberName.trim() !== '' ? (
        <View style={styles.saveEmployerRow}>
          <Button
            variant="ghost"
            onPress={() => {
              addEmployer({
                name: employerText.arbeitgeberName,
                strasse: employerText.arbeitgeberStrasse,
                plzOrt: employerText.arbeitgeberPlzOrt,
                land: 'CH',
              })
              setSavedNotice(true)
            }}
            testID="ch-ngre-arbeitgeber-speichern"
          >
            Arbeitgeber im Profil merken
          </Button>
          {savedNotice ? (
            <Text style={styles.savedEmployerHint} testID="ch-ngre-arbeitgeber-gespeichert">
              ✓ Im Profil unter Unternehmen gespeichert
            </Text>
          ) : null}
        </View>
      ) : null}

      {N_GRE_AMOUNT_FIELDS.map((field) => (
        <NGreInput
          key={field}
          label={tr(`grenzgaenger.nGre.felder.${field}`)}
          initial={nGre[field] === null ? '' : String(nGre[field])}
          numeric
          testID={`ch-ngre-${field}`}
          onCommit={(text) => {
            if (text === '') onSet({ [field]: null })
            else if (/^(0|[1-9]\d*)$/.test(text)) onSet({ [field]: Number(text) })
          }}
        />
      ))}
      {PREMIUMS.map(({ prozent: percent, chf }) => (
        <View key={percent}>
          <NGreInput
            label={tr(`grenzgaenger.nGre.felder.${percent}`)}
            initial={nGre[percent] === null ? '' : String(nGre[percent])}
            numeric
            testID={`ch-ngre-${percent}`}
            onCommit={(text) => {
              if (text === '') onSet({ [percent]: null })
              else if (/^(0|[1-9]\d?|100)$/.test(text)) onSet({ [percent]: Number(text) })
            }}
          />
          {nGre[percent] === null || nGre[percent] === 100 ? (
            <NGreInput
              label={tr(`grenzgaenger.nGre.felder.${chf}`)}
              initial={nGre[chf] === null ? '' : String(nGre[chf])}
              numeric
              testID={`ch-ngre-${chf}`}
              onCommit={(text) => {
                if (text === '') onSet({ [chf]: null })
                else if (/^(0|[1-9]\d*)$/.test(text)) onSet({ [chf]: Number(text) })
              }}
            />
          ) : null}
        </View>
      ))}
      <Feld label={tr('grenzgaenger.nGre.sonderfaelle')}>
        <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
          <Chip active={nGre.specialCases === false} onPress={() => onSet({ specialCases: false })} testID="ch-ngre-sonderfaelle-nein">
            {tr('grenzgaenger.nGre.nein')}
          </Chip>
          <Chip active={nGre.specialCases === true} onPress={() => onSet({ specialCases: true })} testID="ch-ngre-sonderfaelle-ja">
            {tr('grenzgaenger.nGre.ja')}
          </Chip>
        </View>
      </Feld>
    </>
  )
}

function ProvisionSection({ salaryCertificate, onSet }: { readonly salaryCertificate: ChSalaryCertificateResponseDto; readonly onSet: (data: PutProvisionDto) => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const saved = (kind: string) => salaryCertificate.items.find((p) => p.kind === kind)?.amountChf
  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.vorsorge.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.vorsorge.help')}</Text>
      {(
        [
          ['krankenkasseChf', 'Krankenkasse'],
          ['saeule3aChf', 'Saeule3a'],
        ] as const
      ).map(([field, kind]) => {
        const initial = saved(kind)
        return (
          <NGreInput
            key={field}
            label={tr(`grenzgaenger.vorsorge.${field}`)}
            initial={initial === undefined ? '' : String(initial)}
            numeric
            testID={`ch-vorsorge-${field}`}
            onCommit={(text) => {
              if (text === '') onSet({ [field]: null })
              else if (/^(0|[1-9]\d*)$/.test(text)) onSet({ [field]: Number(text) })
            }}
          />
        )
      })}
    </>
  )
}

function NGreInput({
  label,
  initial,
  controlledValue,
  onControlledChange,
  numeric = false,
  testID,
  onCommit,
}: {
  readonly label: string
  readonly initial: string
  readonly controlledValue?: string
  readonly onControlledChange?: (text: string) => void
  readonly numeric?: boolean
  readonly testID: string
  readonly onCommit: (text: string) => void
}) {
  const [internalText, setInternalText] = useState(initial)
  const text = controlledValue !== undefined ? controlledValue : internalText
  function setText(next: string) {
    if (onControlledChange) onControlledChange(next)
    else setInternalText(next)
  }
  function commit() {
    const trimmed = text.trim()
    if (trimmed !== initial) onCommit(trimmed)
  }
  return (
    <Feld label={label}>
      <Input
        type={numeric ? 'numeric' : 'text'}
        value={text}
        onChange={setText}
        onSubmit={commit}
        onBlur={commit}
        accessibilityLabel={label}
        testID={testID}
      />
    </Feld>
  )
}

function ChFieldInput({
  fieldId,
  digit,
  required = false,
  value,
  initial,
  onChangeText,
  onCommit,
}: {
  readonly fieldId: string
  readonly digit: string
  readonly required?: boolean
  readonly value: string
  readonly initial: string
  readonly onChangeText: (text: string) => void
  readonly onCommit: (value: PutSalaryCertificateFieldDto) => void
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  function commit() {
    const trimmed = value.trim()
    if (trimmed === initial) return
    if (trimmed === '') return onCommit({ kind: 'offen' })
    const parsed = integerFrom(trimmed)
    if (parsed !== null) onCommit({ kind: 'erfasst', value: parsed })
  }
  const label = `${tr('grenzgaenger.lohnausweis.ziffer', { n: digit })} · ${tr(`grenzgaenger.lohnausweis.felder.${fieldId}`)}`
  return (
    <View style={required ? styles.requiredFieldWrapper : undefined}>
      {required ? (
        <View style={styles.requiredBadgeRow} testID={`ch-pflicht-${fieldId}`}>
          <Text style={styles.requiredBadgeText}>Pflichtfeld</Text>
        </View>
      ) : null}
      <Feld label={label}>
        <Input
          type="numeric"
          accessibilityLabel={label}
          value={value}
          onChange={onChangeText}
          placeholder="0"
          mono
          onSubmit={commit}
          onBlur={commit}
          testID={`ch-feld-${fieldId}`}
        />
      </Feld>
    </View>
  )
}

function valueFromResponse(salaryCertificate: ChSalaryCertificateResponseDto, id: string): string {
  const field = salaryCertificate.fields.find((x) => x.id === id)
  return field?.kind === 'erfasst' && field.value !== undefined ? String(field.value) : ''
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s3 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const mark: TextStyle = { color: t.color.funke }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s3 }
  const sectionTitle: TextStyle = { ...t.type.cardTitle, color: t.color.tinte, marginBottom: t.space.s2 }
  const statusCard: ViewStyle = { marginTop: t.space.s4 }
  const statusRow: TextStyle = { ...t.type.body, color: t.color.tinte, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  const uploadCard: ViewStyle = {
    marginBottom: t.space.s3,
    padding: t.space.s3,
    backgroundColor: t.color.karte,
    borderWidth: 1.5,
    borderColor: t.color.funke,
  }
  const uploadHeaderRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s3,
  }
  const uploadTitle: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s1 }
  const uploadBody: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const uploadStatusOk: TextStyle = { ...t.type.small, color: t.color.ok, marginTop: t.space.s2 }
  const uploadStatusError: TextStyle = { ...t.type.small, color: t.color.warn, marginTop: t.space.s2 }
  const missingFieldsCard: ViewStyle = {
    marginBottom: t.space.s4,
    padding: t.space.s3,
    backgroundColor: t.color.karte,
    borderWidth: 1.5,
    borderColor: t.color.warn,
  }
  const missingHeaderRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.space.s2,
  }
  const missingBadgeText: TextStyle = { ...t.type.captionStrong, color: t.color.tinte }
  const missingChipsRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const missingChip: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: t.space.s1,
    borderRadius: t.radius.s,
    backgroundColor: t.color.karte,
    borderWidth: 1,
    borderColor: t.color.linie,
  }
  const missingChipText: TextStyle = { ...t.type.caption, color: t.color.tinte }
  const requiredFieldWrapper: ViewStyle = {
    paddingLeft: t.space.s2,
    borderLeftWidth: 3,
    borderLeftColor: t.color.funke,
    marginBottom: t.space.s1,
  }
  const requiredBadgeRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  }
  const requiredBadgeText: TextStyle = {
    ...t.type.captionStrong,
    color: t.color.tinte2,
    textTransform: 'uppercase',
  }
  const liveSumBanner: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s2,
    borderRadius: t.radius.s,
    backgroundColor: t.color.funkeHell,
    borderWidth: 1,
    borderColor: t.color.funke,
  }
  const liveSumText: TextStyle = { ...t.type.small, color: t.color.tinte }
  const liveSumApplyBtn: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: 4,
    borderRadius: t.radius.s,
    backgroundColor: t.color.funke,
  }
  const liveSumApplyText: TextStyle = { ...t.type.captionStrong, color: t.color.nacht }
  const employerPickerBox: ViewStyle = {
    marginBottom: t.space.s3,
    padding: t.space.s3,
    borderRadius: t.radius.s,
    backgroundColor: t.color.karte,
  }
  const employerPickerLabel: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s2 }
  const employerChipsRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const saveEmployerRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: t.space.s2,
    marginBottom: t.space.s3,
  }
  const savedEmployerHint: TextStyle = { ...t.type.small, color: t.color.ok }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    mark,
    help,
    sectionTitle,
    statusCard,
    standRow: statusRow,
    cta,
    uploadCard,
    uploadHeaderRow,
    uploadTitle,
    uploadBody,
    uploadStatusOk,
    uploadStatusError,
    missingFieldsCard,
    missingHeaderRow,
    missingBadgeText,
    missingChipsRow,
    missingChip,
    missingChipText,
    requiredFieldWrapper,
    requiredBadgeRow,
    requiredBadgeText,
    liveSumBanner,
    liveSumText,
    liveSumApplyBtn,
    liveSumApplyText,
    employerPickerBox,
    employerPickerLabel,
    employerChipsRow,
    saveEmployerRow,
    savedEmployerHint,
  }
}
