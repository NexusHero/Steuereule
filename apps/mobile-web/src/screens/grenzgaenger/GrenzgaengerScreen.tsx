// GrenzgaengerScreen (REQ-021, ticket 16) — the Grenzgänger-CH vertical's single screen: the two
// CH-interview questions (`ch-wohnsitz`/`ch-nichtrueckkehrtage`, ADR-013) then the guided
// Lohnausweis mask (ADR-036, Ziffern 1–15, CHF führt). Both run against the REAL API — the CH
// interview through the same interview engine as the Minimal-Gate (`?eintrag=segment-ch`), the
// mask through `GET/PUT /v1/steuerjahre/{jahr}/ch-lohnausweis`. The derived Grenzgänger-Status and
// the fold (Einnahmen/Vorsorgeaufwand/Anrechnung) are shown from the server's response — never
// recomputed in the client (ADR-014/048 determinism boundary, ADR-0033 "server decides what's
// true").
import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Feld, Option, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { ENTRIES, LOHNAUSWEIS_FELDER, formatEuro, nextStepFor, type Answers, type EntryQuestionId } from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useChLohnausweisControllerGet,
  useChLohnausweisControllerSetFeld,
  useChLohnausweisControllerSetWechselkurs,
  getChLohnausweisControllerGetQueryKey,
  type ChLohnausweisResponseDto,
  type PutLohnausweisFeldDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface GrenzgaengerScreenProps {
  /** Fires once the user is done entering their CH data — returns to the Cockpit. */
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

  const [interviewAnswers, setInterviewAnswers] = useState<Answers>({})
  const [seeded, setSeeded] = useState(false)

  // Seed local interview answers once the server's re-entry state resolves (same "server is now
  // the truth" moment as InterviewScreen) — never on every render, so a refetch can't clobber edits.
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
            // The status/offene-Pflichtfelder the fold reports are read from these answers — the
            // Lohnausweis read must refetch so the derived status can flip from `null`.
            void queryClient.invalidateQueries({ queryKey: getChLohnausweisControllerGetQueryKey(taxYear) })
            return
          }
          // 400/409 — undo the optimistic step and resync (same honesty as InterviewScreen).
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

  // The interview phase renders until both questions are answered; then the mask takes over.
  // segment-ch has no gates, so `step.kind === 'question'` covers every non-done state.
  if (step !== null && step.kind === 'question') {
    return <ChInterviewStep stepId={step.id} onAnswer={answer} bp={bp} onBack={onDone} />
  }

  return <LohnausweisStep lohnausweis={lohnausweis} taxYear={taxYear} onSetFeld={setFeld.mutate} onSetWechselkurs={setWechselkurs.mutate} onDone={onDone} bp={bp} />
}

// --- CH-Interview step (two questions, ADR-013) ---------------------------------------------

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

// --- Lohnausweis step (mask + Wechselkurs + Status + fold) -----------------------------------

function LohnausweisStep({
  lohnausweis,
  taxYear,
  onSetFeld,
  onSetWechselkurs,
  onDone,
  bp,
}: {
  readonly lohnausweis: ChLohnausweisResponseDto
  readonly taxYear: number
  readonly onSetFeld: (vars: { jahr: number; feld: string; data: PutLohnausweisFeldDto }) => void
  readonly onSetWechselkurs: (vars: { jahr: number; data: { monat: string; kurs: number; modus: 'amtlich' | 'tatsaechlich' } }) => void
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

/** One editable CHF field — local text state seeded from the server, committed (erfasst/offen) on submit. */
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
  return (
    <Feld label={`${tr('grenzgaenger.lohnausweis.ziffer', { n: ziffer })} · ${tr(`grenzgaenger.lohnausweis.felder.${feldId}`)}`}>
      <Input
        type="numeric"
        value={text}
        onChange={setText}
        placeholder="0"
        mono
        onSubmit={() => {
          const n = Number(text)
          if (text === '') onCommit({ kind: 'offen' })
          else if (/^(0|[1-9]\d*)$/.test(text) && Number.isInteger(n) && n >= 0) onCommit({ kind: 'erfasst', wert: n })
        }}
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
