// KatalogScreen — the on-demand catalogue entries (REQ-017, ticket 08): the 5 Lebenslagen
// (ADR-031) and the Sonderausgaben-Katalog (ADR-016/035), walked by the SAME interview engine
// that runs the Minimal-Gate (ADR-0031 §3: one walker, one registry). The graph stays local
// (`nextStepFor(ENTRIES[entry], answers)`), every answer is `POST .../interview/antworten`, and a
// 409 (the client and server disagreeing) resyncs honestly — exactly the Minimal-Gate's own
// behaviour (ADR-0033: the server decides what's true).
//
// Unlike the Minimal-Gate's three enum questions, the catalogue's "Ja" branches open an INTEGER
// follow-up (the primary amount) — rendered here as a numeric input, never free text. The tax
// FORMULAS behind the amounts (Fünftelregelung, zumutbare Belastung, …) are later slices; this
// screen captures the declaration + the primary value, which is what the Rechenkern folds.
import { useEffect, useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Input, Option, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  ENTRIES,
  QUESTIONS,
  nextStepFor,
  remainingStepsFor,
  type Answers,
  type EntryStepId,
} from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  getCockpitControllerGetCockpitSummaryQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface KatalogScreenProps {
  readonly entry: 'lebenslagen' | 'sonderausgaben'
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function KatalogScreen({ entry, onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: KatalogScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const interviewQuery = useInterviewControllerGetInterview(taxYear, { eintrag: entry })
  const postAnswer = useInterviewControllerPostAnswer()

  const [answers, setAnswers] = useState<Answers>({})
  const [history, setHistory] = useState<readonly EntryStepId[]>([])
  const [seeded, setSeeded] = useState(false)
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    if (!seeded && interviewQuery.data?.status === 200) {
      setAnswers(interviewQuery.data.data.answers as Answers)
      setSeeded(true)
    }
  }, [seeded, interviewQuery.data])

  const current = seeded ? nextStepFor(ENTRIES[entry], answers) : null

  useEffect(() => {
    if (current?.kind === 'done') onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind])

  if (interviewQuery.isPending) {
    return <LoadingState bp={bp} label={tr('katalog.loading')} />
  }
  if (interviewQuery.isError || interviewQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('katalog.loadError.heading')}
        message={tr('katalog.loadError.message')}
        retryLabel={tr('katalog.loadError.retry')}
        onRetry={() => void interviewQuery.refetch()}
      />
    )
  }
  if (!seeded || current === null) {
    return <LoadingState bp={bp} label={tr('katalog.loading')} />
  }

  function answer(stepId: EntryStepId, value: string) {
    setConflict(false)
    setHistory((h) => [...h, stepId])
    setAnswers((a) => ({ ...a, [stepId]: value }))
    postAnswer.mutate(
      { jahr: taxYear, data: { questionId: stepId, value } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
            return
          }
          // 409/400 — the server rejected a write the local graph believed valid/reachable.
          // Undo the optimistic step and resync from the server's own GET (ADR-0033).
          setConflict(true)
          setHistory([])
          setSeeded(false)
          void interviewQuery.refetch()
        },
        onError: () => {
          setAnswers((a) => {
            const next = { ...a }
            delete next[stepId]
            return next
          })
          setHistory((h) => h.slice(0, -1))
        },
      },
    )
  }

  if (current.kind === 'done') {
    return null
  }

  const step = current.id as EntryStepId
  const decl = QUESTIONS[step]

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('katalog.back')} onPress={onBack} /> : <BackButtonSpacer />}
        <Text style={styles.stepPill}>
          {tr('katalog.progress', { done: history.length, total: history.length + remainingStepsFor(ENTRIES[entry], answers) })}
        </Text>
      </View>

      {conflict ? <Text style={styles.conflict}>{tr('katalog.conflict')}</Text> : null}

      <Text style={styles.heading}>{tr(`katalog.questions.${step}`, { defaultValue: step })}</Text>

      {decl.form.kind === 'enum' ? (
        decl.form.values.map((value) => (
          <Option key={value} onPress={() => answer(step, value)}>
            {tr(`katalog.options.${value}`, { defaultValue: value })}
          </Option>
        ))
      ) : (
        <IntegerFollowUp step={step} onAnswer={(value) => answer(step, value)} />
      )}
    </ScrollView>
  )
}

/** An integer follow-up (the primary amount): a numeric input, never free text (D5). */
function IntegerFollowUp({ step, onAnswer }: { readonly step: EntryStepId; readonly onAnswer: (value: string) => void }) {
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState('')

  function submit() {
    const n = Number(text)
    if (Number.isInteger(n) && n >= 0) onAnswer(String(n))
  }

  return (
    <Input
      type="numeric"
      mono
      value={text}
      onChange={setText}
      placeholder={tr('katalog.amountPlaceholder')}
      onSubmit={submit}
      accessibilityLabel={`${tr(`katalog.questions.${step}`, { defaultValue: step })} (${tr('katalog.amountPlaceholder')})`}
    />
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
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space.s4 }
  const stepPill: TextStyle = { color: t.color.tinte2, fontFamily: t.font.mono, fontSize: t.size.s }
  const conflict: TextStyle = { color: t.color.warn, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s3 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
    marginBottom: t.space.s4,
  }
  return { screen, wideScreen, headerRow, stepPill, conflict, heading }
}
