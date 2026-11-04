import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useBreakpoint } from '@steuereule/ui'
import { nextStep, type Answers, type StepId } from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  getCockpitControllerGetCockpitSummaryQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { QuestionScreen } from './QuestionScreen'
import { GateScreen } from './GateScreen'
import { type PostErrorKind } from './PostErrorNotice'
import { LoadingState, ErrorState } from '../shared/ScreenState'

export interface InterviewScreenProps {
  readonly onDone: (answers: Answers) => void
  readonly taxYear?: number
}

export function InterviewScreen({ onDone, taxYear = CURRENT_TAX_YEAR }: InterviewScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  const postAnswer = useInterviewControllerPostAnswer()

  const [answers, setAnswers] = useState<Answers>({})
  const [history, setHistory] = useState<readonly StepId[]>([])
  const [postError, setPostError] = useState<PostErrorKind | null>(null)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (!seeded && interviewQuery.data?.status === 200) {
      setAnswers(interviewQuery.data.data.answers as Answers)
      setSeeded(true)
    }
  }, [seeded, interviewQuery.data])

  const current = seeded ? nextStep(answers) : null

  useEffect(() => {
    if (current?.kind === 'done') onDone(answers)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind])

  if (interviewQuery.isPending) {
    return <LoadingState bp={bp} label={tr('interview.loading')} />
  }
  if (interviewQuery.isError || interviewQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('interview.loadError.heading')}
        message={tr('interview.loadError.message')}
        retryLabel={tr('interview.loadError.retry')}
        onRetry={() => void interviewQuery.refetch()}
      />
    )
  }
  if (!seeded || current === null) {
    return <LoadingState bp={bp} label={tr('interview.loading')} />
  }

  function answer(stepId: StepId, value: string) {
    setPostError(null)
    const previousAnswers = answers
    const previousHistory = history
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
          setPostError(response.status === 409 ? 'conflict' : 'invalid')
          setHistory([])
          setSeeded(false)
          void interviewQuery.refetch()
        },
        onError: () => {
          setAnswers(previousAnswers)
          setHistory(previousHistory)
          setPostError('network')
        },
      },
    )
  }

  function back() {
    setPostError(null)
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      if (prev === undefined) return h
      setAnswers((a) => {
        const next = { ...a }
        delete next[prev]
        return next
      })
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
      canGoBack={history.length > 0}
      onAnswer={(value) => answer(current.id, value)}
      onBack={back}
      bp={bp}
      notice={postError}
    />
  )
}
