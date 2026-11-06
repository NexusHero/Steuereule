import { useEffect, useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, Option, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
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
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface CatalogScreenProps {
  readonly entry: 'lebenslagen' | 'einkuenfte' | 'sonderausgaben' | 'alleinerziehend'
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function CatalogScreen({ entry, onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: CatalogScreenProps) {
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
    if (!seeded && interviewQuery.isFetchedAfterMount && interviewQuery.data?.status === 200) {
      setAnswers(interviewQuery.data.data.answers as Answers)
      setSeeded(true)
    }
  }, [seeded, interviewQuery.isFetchedAfterMount, interviewQuery.data])

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
          <Option key={value} onPress={() => answer(step, value)} testID={`katalog-option-${step}-${value}`}>
            {tr(`katalog.options.${value}`, { defaultValue: value })}
          </Option>
        ))
      ) : (
        <IntegerFollowUp step={step} onAnswer={(value) => answer(step, value)} />
      )}
    </ScrollView>
  )
}

function IntegerFollowUp({ step, onAnswer }: { readonly step: EntryStepId; readonly onAnswer: (value: string) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [text, setText] = useState('')
  const rawValue = integerFrom(text)

  function submit() {
    if (rawValue !== null) onAnswer(String(rawValue))
  }

  return (
    <View>
      <Input
        type="numeric"
        mono
        value={text}
        onChange={setText}
        placeholder={tr('katalog.amountPlaceholder')}
        onSubmit={submit}
        accessibilityLabel={`${tr(`katalog.questions.${step}`, { defaultValue: step })} (${tr('katalog.amountPlaceholder')})`}
        testID={`katalog-input-${step}`}
      />
      <Button onPress={submit} disabled={rawValue === null} style={styles.weiter} testID={`katalog-submit-${step}`}>
        {tr('katalog.weiter')}
      </Button>
    </View>
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
  const next: ViewStyle = { marginTop: t.space.s4 }
  return { screen, wideScreen, headerRow, stepPill, conflict, heading, weiter: next }
}
