import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useBreakpoint } from '@steuereule/ui'
import { ENTRIES, nextStep, nextStepFor, type Answers, type InterviewOptions, type StepId } from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getTaxEstimateControllerGetQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { runningTaxYear } from '../../config/taxYear'
import { QuestionScreen } from './QuestionScreen'
import { GateScreen } from './GateScreen'
import { type PostError } from './PostErrorNotice'
import { clearStepAndFollowUps } from './clearStepAndFollowUps'
import { LoadingState, LoadFailedState } from '../shared/ScreenState'
import { classifyApiFailure, useApiFailureMessage } from '../../net/apiFailure'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'
import { useSelfEmploymentCapability } from '../business/useSelfEmployment'

function walkedMinimalGateSteps(answers: Answers, options: InterviewOptions): readonly StepId[] {
  const walked: StepId[] = []
  let reached: Answers = {}
  for (;;) {
    const step = nextStepFor(ENTRIES['minimal-gate'], reached, options)
    if (step.kind === 'done') return walked
    const id = step.id as StepId
    const answer = answers[id]
    if (answer === undefined) return walked
    if (walked.includes(id)) return walked
    walked.push(id)
    reached = { ...reached, [id]: answer }
  }
}

export interface InterviewScreenProps {
  readonly onDone: (answers: Answers) => void
  readonly taxYear?: number
  /** K2: switch the tax year from the first question ("Anderes Jahr"). */
  readonly onChangeYear?: (year: number) => void
}

export function InterviewScreen({ onDone, taxYear = runningTaxYear(), onChangeYear }: InterviewScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  // The server's switch decides whether the Gewerbe gate stops the self-employed (ADR-0101 §20).
  const capability = useSelfEmploymentCapability()
  const options = capability.options
  const postAnswer = useInterviewControllerPostAnswer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
        void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
        void queryClient.invalidateQueries({
          queryKey: getInterviewControllerGetInterviewQueryKey(taxYear),
          exact: true,
          ...(refetchOnInterviewSyncRef.current ? {} : { refetchType: 'none' }),
        })
      },
    },
  })

  const [answers, setAnswers] = useState<Answers>({})
  const [history, setHistory] = useState<readonly StepId[]>([])
  const [postError, setPostError] = useState<PostError | null>(null)
  // NM-06: the interview moves on only once the last answer is stored, so a failure is still seen here.
  const [pendingCount, setPendingCount] = useState(0)
  const failureMessage = useApiFailureMessage()
  const [seeded, setSeeded] = useState(false)
  const mutationQueue = useRef<Promise<void>>(Promise.resolve())
  const refetchOnInterviewSyncRef = useRef(false)

  useEffect(() => {
    refetchOnInterviewSyncRef.current = false
    return () => {
      refetchOnInterviewSyncRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!seeded && !capability.pending && interviewQuery.isFetchedAfterMount && interviewQuery.isSuccess) {
      const loaded = interviewQuery.data.data.answers as Answers
      setAnswers(loaded)
      setHistory(walkedMinimalGateSteps(loaded, options))
      setSeeded(true)
    }
  }, [seeded, capability.pending, interviewQuery.isFetchedAfterMount, interviewQuery.data])

  const current = seeded ? nextStep(answers, options) : null

  useEffect(() => {
    if (current?.kind === 'done' && pendingCount === 0) onDone(answers)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind, pendingCount])

  if (interviewQuery.isPending) {
    return <LoadingState bp={bp} label={tr('interview.loading')} />
  }
  if (interviewQuery.isError) return <LoadFailedState bp={bp} error={interviewQuery.error} onRetry={() => void interviewQuery.refetch()} />
  if (!seeded || current === null) {
    return <LoadingState bp={bp} label={tr('interview.loading')} />
  }

  function answer(stepId: StepId, value: string) {
    setPostError(null)
    const previousAnswers = answers
    const previousHistory = history
    const nextAnswers = { ...answers, [stepId]: value }
    if (nextStep(nextAnswers, options).kind === 'done') {
      refetchOnInterviewSyncRef.current = true
    }
    setHistory((h) => [...h, stepId])
    setAnswers(nextAnswers)
    setPendingCount((c) => c + 1)

    mutationQueue.current = mutationQueue.current
      .then(async () => {
        try {
          await postAnswer.mutateAsync({ jahr: taxYear, data: { questionId: stepId, value } })
        } catch (error) {
          triggerSaveErrorHaptic()
          refetchOnInterviewSyncRef.current = false
          const failure = classifyApiFailure(error)
          if (failure.kind === 'conflict' || failure.kind === 'validation') {
            // The server and the local graph disagree: resync from a fresh GET.
            setPostError({ kind: failure.kind === 'conflict' ? 'conflict' : 'invalid' })
            setHistory([])
            setSeeded(false)
            void interviewQuery.refetch()
            return
          }
          setAnswers(previousAnswers)
          setHistory(previousHistory)
          // NM-07: a lost connection asks to check it; a 401, 429 or 500 says what it is.
          setPostError(failure.kind === 'offline' ? { kind: 'network' } : { kind: 'failed', detail: failureMessage(error) })
        } finally {
          setPendingCount((c) => c - 1)
        }
      })
      .catch(() => {})
  }

  function back() {
    refetchOnInterviewSyncRef.current = false
    setPostError(null)
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

  if (current.kind === 'gate') {
    return (
      <GateScreen
        gateId={current.id}
        job={answers.job}
        onAcknowledge={(value) => answer(current.id, value)}
        onBack={back}
        bp={bp}
        notice={postError}
      />
    )
  }

  return (
    <QuestionScreen
      questionId={current.id}
      answers={answers}
      canGoBack={history.length > 0}
      onAnswer={(value) => answer(current.id, value)}
      onBack={back}
      bp={bp}
      notice={postError}
      taxYear={taxYear}
      {...(onChangeYear ? { onChangeYear } : {})}
    />
  )
}
