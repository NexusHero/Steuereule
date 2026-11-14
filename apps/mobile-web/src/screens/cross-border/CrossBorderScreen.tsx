import { useState, useRef } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Input, Feld, Option, Pill, useTheme, useBreakpoint, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { ANNUAL_AVERAGE_RATES, ENTRIES, SALARY_CERTIFICATE_FIELDS, formatEuro, nextStepFor, type Answers, type EntryQuestionId } from '@steuereule/core'
import {
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
  // the generated client's own variables, so the path parameters follow the spec
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
  const styles = makeStyles(t)
  const [month, setMonth] = useState(salaryCertificate.exchangeRate?.month ?? "")
  const [rateError, setRateError] = useState(false)
  const [rate, setRate] = useState(salaryCertificate.exchangeRate !== null && salaryCertificate.exchangeRate !== undefined ? String(salaryCertificate.exchangeRate.rate) : '')

  const amountFields = SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag')
  const foldStatus = salaryCertificate.foldStatus
  const status = salaryCertificate.status

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('grenzgaenger.back')} onPress={onBack} /> : <BackButtonSpacer />}
        <Text style={styles.heading}>{tr('grenzgaenger.lohnausweis.title')}</Text>
      </View>
      {partnerName !== undefined ? <Text style={styles.help} testID="ch-partner-hinweis">{tr('grenzgaenger.partnerFor', { name: partnerName })}</Text> : null}
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.help')}</Text>

      {amountFields.map((field) => (
        <ChFieldInput key={field.id} fieldId={field.id} digit={field.digit} initial={valueFromResponse(salaryCertificate, field.id)} onCommit={(value) => onSetField({ jahr: taxYear, feld: field.id, data: value })} />
      ))}

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
  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.nGre.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.nGre.help')}</Text>
      {N_GRE_TEXT_FIELDS.map((field) => (
        <NGreInput
          key={field}
          label={tr(`grenzgaenger.nGre.felder.${field}`)}
          initial={nGre[field] ?? ''}
          testID={`ch-ngre-${field}`}
          onCommit={(text) => onSet({ [field]: text === '' ? null : text })}
        />
      ))}
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
  numeric = false,
  testID,
  onCommit,
}: {
  readonly label: string
  readonly initial: string
  readonly numeric?: boolean
  readonly testID: string
  readonly onCommit: (text: string) => void
}) {
  const [text, setText] = useState(initial)
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
  initial,
  onCommit,
}: {
  readonly fieldId: string
  readonly digit: string
  readonly initial: string
  readonly onCommit: (value: PutSalaryCertificateFieldDto) => void
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState(initial)
  function commit() {
    const trimmed = text.trim()
    if (trimmed === initial) return
    if (trimmed === '') return onCommit({ kind: 'offen' })
    const value = integerFrom(trimmed)
    if (value !== null) onCommit({ kind: 'erfasst', value })
  }
  const label = `${tr('grenzgaenger.lohnausweis.ziffer', { n: digit })} · ${tr(`grenzgaenger.lohnausweis.felder.${fieldId}`)}`
  return (
    <Feld label={label}>
      <Input
        type="numeric"
        accessibilityLabel={label}
        value={text}
        onChange={setText}
        placeholder="0"
        mono
        onSubmit={commit}
        onBlur={commit}
        testID={`ch-feld-${fieldId}`}
      />
    </Feld>
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
  return { screen, wideScreen, headerRow, heading, mark, help, sectionTitle, statusCard, standRow: statusRow, cta }
}
