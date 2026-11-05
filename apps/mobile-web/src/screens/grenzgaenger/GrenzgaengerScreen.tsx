import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Input, Feld, Option, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { ENTRIES, LOHNAUSWEIS_FELDER, formatEuro, nextStepFor, type Answers, type EntryQuestionId } from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useChLohnausweisControllerGet,
  useChLohnausweisControllerSetFeld,
  useChLohnausweisControllerSetNGre,
  useChLohnausweisControllerSetWechselkurs,
  getChLohnausweisControllerGetQueryKey,
  type ChLohnausweisResponseDto,
  type PutLohnausweisFeldDto,
  type NGreAngabenDto,
  type PutNGreDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { ganzzahlAus } from '../shared/ganzzahl'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface GrenzgaengerScreenProps {
  readonly onDone: () => void
  readonly taxYear?: number
}

const SEGMENT_CH = ENTRIES['segment-ch']

export function GrenzgaengerScreen({ onDone, taxYear = CURRENT_TAX_YEAR }: GrenzgaengerScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const interviewQuery = useInterviewControllerGetInterview(taxYear, { eintrag: 'segment-ch' })
  const lohnausweisQuery = useChLohnausweisControllerGet(taxYear)
  const postAnswer = useInterviewControllerPostAnswer()
  const setFeld = useChLohnausweisControllerSetFeld()
  const setWechselkurs = useChLohnausweisControllerSetWechselkurs()
  const setNGre = useChLohnausweisControllerSetNGre()

  const [interviewAnswers, setInterviewAnswers] = useState<Answers>({})
  const [seeded, setSeeded] = useState(false)

  if (!seeded && interviewQuery.data?.status === 200) {
    setInterviewAnswers(interviewQuery.data.data.answers as Answers)
    setSeeded(true)
  }

  if (interviewQuery.isPending || lohnausweisQuery.isPending) {
    return <LoadingState bp={bp} label={tr('grenzgaenger.loading')} />
  }
  if (interviewQuery.isError || interviewQuery.data.status !== 200 || lohnausweisQuery.isError || lohnausweisQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('grenzgaenger.loadError.heading')}
        message={tr('grenzgaenger.loadError.message')}
        retryLabel={tr('grenzgaenger.loadError.retry')}
        onRetry={() => {
          void interviewQuery.refetch()
          void lohnausweisQuery.refetch()
        }}
      />
    )
  }

  const step = seeded ? nextStepFor(SEGMENT_CH, interviewAnswers) : null
  const lohnausweis = lohnausweisQuery.data.data

  function answer(questionId: EntryQuestionId, value: string) {
    const previous = interviewAnswers
    setInterviewAnswers((a) => ({ ...a, [questionId]: value }))
    postAnswer.mutate(
      { jahr: taxYear, data: { questionId, value } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getChLohnausweisControllerGetQueryKey(taxYear) })
            return
          }
          setInterviewAnswers(previous)
          setSeeded(false)
          void interviewQuery.refetch()
        },
        onError: () => {
          setInterviewAnswers(previous)
        },
      },
    )
  }

  if (step !== null && step.kind === 'question') {
    return <ChInterviewStep stepId={step.id} onAnswer={answer} bp={bp} onBack={onDone} />
  }

  return (
    <LohnausweisStep
      lohnausweis={lohnausweis}
      taxYear={taxYear}
      onSetFeld={setFeld.mutate}
      onSetWechselkurs={setWechselkurs.mutate}
      onSetNGre={(data) =>
        setNGre.mutate(
          { jahr: taxYear, data },
          { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getChLohnausweisControllerGetQueryKey(taxYear) }) },
        )
      }
      onDone={onDone}
      bp={bp}
    />
  )
}

function ChInterviewStep({ stepId, onAnswer, bp, onBack }: { readonly stepId: EntryQuestionId; readonly onAnswer: (id: EntryQuestionId, value: string) => void; readonly bp: Breakpoint; readonly onBack: () => void }) {
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
        <Text style={styles.help}>{tr('grenzgaenger.interview.wohnsitz.help')}</Text>
        <Option onPress={() => onAnswer('ch-wohnsitz', 'Deutschland')}>{tr('grenzgaenger.interview.wohnsitz.deutschland')}</Option>
        <Option onPress={() => onAnswer('ch-wohnsitz', 'Schweiz')}>{tr('grenzgaenger.interview.wohnsitz.schweiz')}</Option>
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
      <Text style={styles.help}>{tr('grenzgaenger.interview.tage.help')}</Text>
      <TageInput onAnswer={onAnswer} />
    </ScrollView>
  )
}

function TageInput({ onAnswer }: { readonly onAnswer: (id: EntryQuestionId, value: string) => void }) {
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

function LohnausweisStep({
  lohnausweis,
  taxYear,
  onSetFeld,
  onSetWechselkurs,
  onSetNGre,
  onDone,
  bp,
}: {
  readonly lohnausweis: ChLohnausweisResponseDto
  readonly taxYear: number
  readonly onSetFeld: (vars: { jahr: number; feld: string; data: PutLohnausweisFeldDto }) => void
  readonly onSetWechselkurs: (vars: { jahr: number; data: { monat: string; kurs: number; modus: 'amtlich' | 'tatsaechlich' } }) => void
  readonly onSetNGre: (data: PutNGreDto) => void
  readonly onDone: () => void
  readonly bp: Breakpoint
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [monat, setMonat] = useState(lohnausweis.wechselkurs?.monat ?? `${taxYear}-01`)
  const [kurs, setKurs] = useState(lohnausweis.wechselkurs !== null && lohnausweis.wechselkurs !== undefined ? String(lohnausweis.wechselkurs.kurs) : '')

  const betragFelder = LOHNAUSWEIS_FELDER.filter((f) => f.art === 'chf-betrag')
  const stand = lohnausweis.stand
  const status = lohnausweis.status

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        <BackButtonSpacer />
        <Text style={styles.heading}>{tr('grenzgaenger.lohnausweis.title')}</Text>
      </View>
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.help')}</Text>

      {betragFelder.map((feld) => (
        <ChFeldInput key={feld.id} feldId={feld.id} ziffer={feld.ziffer} initial={wertAusResponse(lohnausweis, feld.id)} onCommit={(wert) => onSetFeld({ jahr: taxYear, feld: feld.id, data: wert })} />
      ))}

      <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.wechselkurs.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.wechselkurs.help')}</Text>
      <Feld label={tr('grenzgaenger.lohnausweis.wechselkurs.monat')}>
        <Input type="text" value={monat} onChange={setMonat} placeholder={`${taxYear}-01`} testID="ch-wechselkurs-monat" />
      </Feld>
      <Feld label={tr('grenzgaenger.lohnausweis.wechselkurs.kurs')}>
        <Input type="numeric" value={kurs} onChange={setKurs} placeholder="0.9412" testID="ch-wechselkurs-kurs" />
      </Feld>
      <Button
        variante="ghost"
        onPress={() => {
          const n = Number(kurs)
          if (monat !== '' && Number.isFinite(n) && n > 0) {
            onSetWechselkurs({ jahr: taxYear, data: { monat, kurs: n, modus: 'amtlich' } })
          }
        }}
      >
        {tr('grenzgaenger.lohnausweis.wechselkurs.amtlich')}
      </Button>

      <NGreAbschnitt nGre={lohnausweis.nGre} onSet={onSetNGre} />

      {status !== null ? (
        <Card variant="default" style={styles.statusCard}>
          <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.status.label')}</Text>
          <Pill>{status === 'echter-grenzgaenger' ? tr('grenzgaenger.lohnausweis.status.echterGrenzgaenger') : tr('grenzgaenger.lohnausweis.status.keinGrenzgaenger')}</Pill>
        </Card>
      ) : (
        <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.status.offen')}</Text>
      )}

      {stand !== null ? (
        <Card variant="default" style={styles.statusCard}>
          <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.stand.label')}</Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.einnahmen')}: {formatEuro(stand.einnahmen)}
          </Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.vorsorgeaufwand')}: {formatEuro(stand.vorsorgeaufwand)}
          </Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.anrechnung')}: {formatEuro(stand.anrechnung)}
          </Text>
          {stand.kind === 'offen' && stand.offenePosten !== undefined ? (
            <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.stand.offen', { count: stand.offenePosten })}</Text>
          ) : null}
        </Card>
      ) : null}

      <Button onPress={onDone} style={styles.cta}>
        {tr('grenzgaenger.lohnausweis.done')}
      </Button>
    </ScrollView>
  )
}

const N_GRE_TEXTFELDER = ['arbeitgeberName', 'arbeitgeberStrasse', 'arbeitgeberPlzOrt'] as const
const N_GRE_BETRAGSFELDER = ['familienzulagenChf', 'krankentaggeldChf', 'pkArbeitnehmerChf', 'pkArbeitgeberChf'] as const

function NGreAbschnitt({ nGre, onSet }: { readonly nGre: NGreAngabenDto; readonly onSet: (data: PutNGreDto) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.nGre.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.nGre.help')}</Text>
      {N_GRE_TEXTFELDER.map((feld) => (
        <NGreEingabe
          key={feld}
          label={tr(`grenzgaenger.nGre.felder.${feld}`)}
          initial={nGre[feld] ?? ''}
          testID={`ch-ngre-${feld}`}
          onCommit={(text) => onSet({ [feld]: text === '' ? null : text })}
        />
      ))}
      {N_GRE_BETRAGSFELDER.map((feld) => (
        <NGreEingabe
          key={feld}
          label={tr(`grenzgaenger.nGre.felder.${feld}`)}
          initial={nGre[feld] === null ? '' : String(nGre[feld])}
          numeric
          testID={`ch-ngre-${feld}`}
          onCommit={(text) => {
            if (text === '') onSet({ [feld]: null })
            else if (/^(0|[1-9]\d*)$/.test(text)) onSet({ [feld]: Number(text) })
          }}
        />
      ))}
      <Feld label={tr('grenzgaenger.nGre.sonderfaelle')}>
        <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
          <Chip aktiv={nGre.sonderfaelle === false} onPress={() => onSet({ sonderfaelle: false })} testID="ch-ngre-sonderfaelle-nein">
            {tr('grenzgaenger.nGre.nein')}
          </Chip>
          <Chip aktiv={nGre.sonderfaelle === true} onPress={() => onSet({ sonderfaelle: true })} testID="ch-ngre-sonderfaelle-ja">
            {tr('grenzgaenger.nGre.ja')}
          </Chip>
        </View>
      </Feld>
    </>
  )
}

function NGreEingabe({
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
    const getrimmt = text.trim()
    if (getrimmt !== initial) onCommit(getrimmt)
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

function ChFeldInput({
  feldId,
  ziffer,
  initial,
  onCommit,
}: {
  readonly feldId: string
  readonly ziffer: string
  readonly initial: string
  readonly onCommit: (wert: PutLohnausweisFeldDto) => void
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState(initial)
  function commit() {
    const getrimmt = text.trim()
    if (getrimmt === initial) return
    if (getrimmt === '') return onCommit({ kind: 'offen' })
    const wert = ganzzahlAus(getrimmt)
    if (wert !== null) onCommit({ kind: 'erfasst', wert })
  }
  return (
    <Feld label={`${tr('grenzgaenger.lohnausweis.ziffer', { n: ziffer })} · ${tr(`grenzgaenger.lohnausweis.felder.${feldId}`)}`}>
      <Input
        type="numeric"
        value={text}
        onChange={setText}
        placeholder="0"
        mono
        onSubmit={commit}
        onBlur={commit}
        testID={`ch-feld-${feldId}`}
      />
    </Feld>
  )
}

function wertAusResponse(lohnausweis: ChLohnausweisResponseDto, id: string): string {
  const feld = lohnausweis.felder.find((x) => x.id === id)
  return feld?.kind === 'erfasst' && feld.wert !== undefined ? String(feld.wert) : ''
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
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s3 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const mark: TextStyle = { color: t.color.funke }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s3 }
  const sectionTitle: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.l, color: t.color.tinte, marginBottom: t.space.s2 }
  const statusCard: ViewStyle = { marginTop: t.space.s4 }
  const standRow: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return { screen, wideScreen, headerRow, heading, mark, help, sectionTitle, statusCard, standRow, cta }
}
