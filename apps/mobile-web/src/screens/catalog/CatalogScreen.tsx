import { useEffect, useRef, useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Input, Option, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  formatEuro,
  AMOUNT_LATER,
  ENTRIES,
  LATER_ALLOWED_STEPS,
  QUESTIONS,
  nextStepFor,
  remainingStepsFor,
  type Answers,
  type CatalogueEntry,
  type EntryStepId,
} from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useLinkControllerGet,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getTaxEstimateControllerGetQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import type { CatalogEntryParam } from '../../navigation/routes'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'

function collectFollowUpStepIds(stepId: EntryStepId, acc = new Set<EntryStepId>()): ReadonlySet<EntryStepId> {
  if (acc.has(stepId)) return acc
  acc.add(stepId)
  const decl = QUESTIONS[stepId]
  if (decl.followUps !== undefined) {
    for (const branch of Object.values(decl.followUps)) {
      for (const target of branch) {
        const id = typeof target === 'string' ? target : target.step
        collectFollowUpStepIds(id, acc)
      }
    }
  }
  if (decl.defaultFollowUp !== undefined) {
    for (const target of decl.defaultFollowUp) {
      const id = typeof target === 'string' ? target : target.step
      collectFollowUpStepIds(id, acc)
    }
  }
  return acc
}

function clearStepAndFollowUps(answers: Answers, stepId: EntryStepId): Answers {
  const toDelete = collectFollowUpStepIds(stepId)
  const next: Answers = { ...answers }
  for (const id of toDelete) {
    delete next[id]
  }
  return next
}

const LATER_ALLOWED_SET: ReadonlySet<EntryStepId> = new Set<EntryStepId>(LATER_ALLOWED_STEPS)

function clearLaterAnswers(answers: Answers, walked: readonly EntryStepId[]): Answers {
  const next: Answers = { ...answers }
  for (const id of walked) {
    if (next[id] === AMOUNT_LATER) delete next[id]
  }
  return next
}

function walkedStepsFor(entry: CatalogueEntry, answers: Answers): readonly EntryStepId[] {
  const walked: EntryStepId[] = []
  let reached: Answers = {}
  for (;;) {
    const step = nextStepFor(entry, reached)
    if (step.kind === 'done') return walked
    const id = step.id
    const answer = answers[id]
    if (answer === undefined) return walked
    if (walked.includes(id)) return walked
    walked.push(id)
    reached = { ...reached, [id]: answer }
  }
}

/** The pages of the cockpit's tunnel, and the ones only the interview and the owl workbench show. */
export type CatalogScreenEntry = CatalogEntryParam | 'minimal-gate' | 'segment-2' | 'segment-ch' | 'berufsprofil'

export interface CatalogScreenProps {
  readonly entry: CatalogScreenEntry
  /**
   * With `revisit`: opens the page at this step instead of at its last one, so a link from the owl
   * ("Maske ansehen") lands on the question the draft is about (#488).
   */
  readonly focusStep?: EntryStepId | undefined
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly revisit?: boolean
}

/** Entries each spouse answers for themselves; in a joint return the user picks whose answers these are (ADR-0088). */
const PERSONAL_ENTRIES: readonly CatalogScreenEntry[] = ['lebenslagen', 'sonderausgaben']

export function CatalogScreen(props: CatalogScreenProps) {
  const { entry, taxYear = CURRENT_TAX_YEAR } = props
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const personal = PERSONAL_ENTRIES.includes(entry)
  const link = useLinkControllerGet(taxYear, { query: { enabled: personal, retry: false } })
  const coupling = link.data?.status === 200 ? link.data.data : null
  const partnerName = coupling?.filingType === 'zusammen' && coupling.personBHasOwnAccount !== true ? coupling.personB?.firstName?.trim() || tr('katalog.fuerWen.partnerFallback') : null
  const [person, setPerson] = useState<'A' | 'B'>('A')
  if (!personal || partnerName === null) return <CatalogFlow {...props} person="A" />
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, alignItems: 'center', paddingHorizontal: t.space.s4, paddingTop: t.space.s3 }} testID="katalog-fuer-wen">
        <Text style={{ color: t.color.tinte, fontFamily: t.font.text }}>{tr('katalog.fuerWen.label')}</Text>
        <Chip active={person === 'A'} onPress={() => setPerson('A')} testID="katalog-fuer-a">
          {tr('katalog.fuerWen.mich')}
        </Chip>
        <Chip active={person === 'B'} onPress={() => setPerson('B')} testID="katalog-fuer-b">
          {tr('katalog.fuerWen.partner', { name: partnerName })}
        </Chip>
      </View>
      <CatalogFlow key={person} {...props} person={person} />
    </>
  )
}

function CatalogFlow({ entry, focusStep, onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, revisit = false, person }: CatalogScreenProps & { readonly person: 'A' | 'B' }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  // Person B's personal answers live in B's record (ADR-0088).
  const params = person === 'B' ? ({ eintrag: entry, person: 'B' } as const) : { eintrag: entry }
  const interviewQuery = useInterviewControllerGetInterview(taxYear, params)
  // #452 slice 4: last year's amounts (Spenden, Riester), offered on a click.
  const priorQuery = useInterviewControllerGetInterview(taxYear - 1, params, { query: { retry: false } })
  const priorAnswers = priorQuery.data?.status === 200 ? (priorQuery.data.data.answers as Answers) : {}
  const postAnswer = useInterviewControllerPostAnswer()

  const [answers, setAnswers] = useState<Answers>({})
  const [history, setHistory] = useState<readonly EntryStepId[]>([])
  const [seeded, setSeeded] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const mutationQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!seeded && interviewQuery.isFetchedAfterMount && interviewQuery.data?.status === 200) {
      const loaded = interviewQuery.data.data.answers as Answers
      const walked = walkedStepsFor(ENTRIES[entry], loaded)
      const focusIndex = revisit && focusStep !== undefined ? walked.indexOf(focusStep) : -1
      if (focusIndex !== -1 && focusStep !== undefined) {
        setHistory(walked.slice(0, focusIndex))
        setAnswers(clearStepAndFollowUps(loaded, focusStep))
      } else if (revisit && nextStepFor(ENTRIES[entry], loaded).kind === 'done' && walked.length > 0) {
        const firstLaterIdx = walked.findIndex((id) => loaded[id] === AMOUNT_LATER)
        if (firstLaterIdx !== -1) {
          setHistory(walked.slice(0, firstLaterIdx))
          setAnswers(clearLaterAnswers(loaded, walked))
        } else {
          const last = walked[walked.length - 1]
          if (last !== undefined) {
            setHistory(walked.slice(0, -1))
            setAnswers(clearStepAndFollowUps(loaded, last))
          } else {
            setHistory(walked)
            setAnswers(loaded)
          }
        }
      } else {
        setHistory(walked)
        setAnswers(loaded)
      }
      setSeeded(true)
    }
  }, [seeded, interviewQuery.isFetchedAfterMount, interviewQuery.data, entry, revisit, focusStep])

  const current = seeded ? nextStepFor(ENTRIES[entry], answers) : null

  useEffect(() => {
    if (current?.kind === 'done' && pendingCount === 0 && !postAnswer.isPending) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind, pendingCount, postAnswer.isPending])

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
    const previousAnswers = answers
    const previousHistory = history
    setHistory((h) => [...h, stepId])
    setAnswers((a) => ({ ...a, [stepId]: value }))
    setPendingCount((c) => c + 1)

    mutationQueue.current = mutationQueue.current
      .then(async () => {
        try {
          const response = await postAnswer.mutateAsync({ jahr: taxYear, data: { questionId: stepId, value }, ...(person === 'B' ? { params: { person: 'B' as const } } : {}) })
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
            void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
            void queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear), exact: true })
            void queryClient.invalidateQueries({
              queryKey: getInterviewControllerGetInterviewQueryKey(taxYear, params),
              refetchType: 'none',
            })
            return
          }
          setConflict(true)
          triggerSaveErrorHaptic()
          setHistory([])
          setSeeded(false)
          void interviewQuery.refetch()
        } catch {
          triggerSaveErrorHaptic()
          setAnswers(previousAnswers)
          setHistory(previousHistory)
        } finally {
          setPendingCount((c) => c - 1)
        }
      })
      .catch(() => {})
  }

  function back() {
    setConflict(false)
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      if (prev === undefined) return h
      setAnswers((a) => clearStepAndFollowUps(a, prev))
      return h.slice(0, -1)
    })
  }

  if (current.kind === 'done') {
    return null
  }

  const step = current.id as EntryStepId
  const decl = QUESTIONS[step]
  const hint = tr(`katalog.hints.${step}`, { defaultValue: '' })
  const handleBack = history.length > 0 ? back : onBack

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {handleBack ? <BackButton accessibilityLabel={tr('katalog.back')} onPress={handleBack} /> : <BackButtonSpacer />}
        <Text style={styles.stepPill}>
          {tr('katalog.progress', { done: history.length, total: history.length + remainingStepsFor(ENTRIES[entry], answers) })}
        </Text>
      </View>

      {conflict ? <Text style={styles.conflict}>{tr('katalog.conflict')}</Text> : null}

      <Text style={styles.heading}>{tr(`katalog.questions.${step}`, { defaultValue: step })}</Text>
      {hint !== '' ? <Text style={styles.hint} testID={`katalog-hinweis-${step}`}>{hint}</Text> : null}

      {decl.form.kind === 'enum' ? (
        decl.form.values.map((value) => (
          <Option key={value} onPress={() => answer(step, value)} testID={`katalog-option-${step}-${value}`}>
            {tr(`katalog.options.${value}`, { defaultValue: value })}
          </Option>
        ))
      ) : (
        <IntegerFollowUp
          key={step}
          step={step}
          onAnswer={(value) => answer(step, value)}
          priorYear={taxYear - 1}
          priorValue={PRIOR_YEAR_STEPS.has(step) ? priorAmount(priorAnswers[step]) : null}
        />
      )}
    </ScrollView>
  )
}

/** Amounts that rarely change and may be taken over from last year (#452 decision 8). */
const PRIOR_YEAR_STEPS: ReadonlySet<EntryStepId> = new Set<EntryStepId>(['spenden-betrag', 'riester-betrag'])

function priorAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw === AMOUNT_LATER) return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

function IntegerFollowUp({
  step,
  onAnswer,
  priorYear,
  priorValue = null,
}: {
  readonly step: EntryStepId
  readonly onAnswer: (value: string) => void
  readonly priorYear?: number
  readonly priorValue?: number | null
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [text, setText] = useState('')
  const [takenOver, setTakenOver] = useState(false)
  const rawValue = integerFrom(text)
  const canEnterLater = LATER_ALLOWED_SET.has(step)
  // Leaving the field saves the amount (#443 AC 7: closing the sheet must not lose it); the button
  // and Enter save the same answer, so it is sent once.
  const sent = useRef(false)

  function submit() {
    if (rawValue === null || sent.current) return
    sent.current = true
    onAnswer(String(rawValue))
  }

  return (
    <View>
      {priorValue !== null && priorYear !== undefined && !takenOver ? (
        <Button
          variant="leise"
          onPress={() => {
            setText(String(priorValue))
            setTakenOver(true)
          }}
          style={styles.later}
          testID={`wie-vorjahr-${step}`}
        >
          {tr('vorjahr.betrag', { year: priorYear, amount: formatEuro(priorValue) })}
        </Button>
      ) : null}
      {takenOver && priorYear !== undefined ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite" testID={`wie-vorjahr-markiert-${step}`}>
          {tr('vorjahr.markiert', { year: priorYear })}
        </Text>
      ) : null}
      <Input
        type="numeric"
        mono
        value={text}
        onChange={(next) => {
          setText(next)
          setTakenOver(false)
        }}
        placeholder={tr('katalog.amountPlaceholder')}
        onSubmit={submit}
        onBlur={submit}
        accessibilityLabel={`${tr(`katalog.questions.${step}`, { defaultValue: step })} (${tr('katalog.amountPlaceholder')})`}
        testID={`katalog-input-${step}`}
      />
      <Button onPress={submit} disabled={rawValue === null} style={styles.weiter} testID={`katalog-submit-${step}`}>
        {tr('katalog.weiter')}
      </Button>
      {canEnterLater ? (
        <Button
          variant="leise"
          onPress={() => onAnswer(AMOUNT_LATER)}
          style={styles.later}
          testID={`katalog-later-${step}`}
        >
          {tr('katalog.amountLater')}
        </Button>
      ) : null}
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
  const hint: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte2,
    marginBottom: t.space.s4,
  }
  const next: ViewStyle = { marginTop: t.space.s4 }
  const later: ViewStyle = { marginTop: t.space.s2 }
  return { screen, wideScreen, headerRow, stepPill, conflict, heading, hint, weiter: next, later }
}
