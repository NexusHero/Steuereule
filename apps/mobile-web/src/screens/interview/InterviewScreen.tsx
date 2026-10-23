// InterviewScreen (REQ-015, #318 task 2) — the Minimal-Gate: three questions (job, ausland,
// kinder), one per screen, plus the two hard branches (Gewerbe-Gate, CH-only-Gate).
//
// WHERE THE TRUTH LIVES (#318 task 2 brief): the graph stays local. Every screen still renders
// from `nextStep(answers)` in `@steuereule/core` (ADR-0033) — never a round trip per tap. `answers`
// is seeded once from the server's `GET .../interview` on mount and every answer is persisted with
// a `POST .../interview/antworten` the moment the user taps, without waiting for it before
// advancing — the local graph decides what's next, the server decides what's true. A non-200 write
// (400/409, the client and server disagreeing) or a network failure undoes the optimistic local
// step and resyncs honestly — never swallowed. Gates are answerable steps, not client-remembered
// screens (ADR-0033); back navigation discards the stored answer so `nextStep` recomputes — no
// DELETE call exists, so a re-answer overwrites the prior row (the service's own upsert).
//
// The question and gate sub-screens live in ./QuestionScreen and ./GateScreen; the loading/error
// states render through the shared ScreenState (Phase 0.3 AC-3).
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
  /** Fires exactly once, when `nextStep(answers)` first reaches `{ kind: 'done' }`. */
  readonly onDone: () => void
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
  // Flips true exactly once `answers` genuinely reflects the server's own state — the initial
  // GET's success, or a resync after a rejected write. Rendering waits for it rather than
  // computing `nextStep({})` for one frame on every (re)load, which would flash the job question
  // even on re-entry with answers already stored.
  const [seeded, setSeeded] = useState(false)

  // Seed local state from the server exactly once per "the server is now the truth" moment —
  // never on every render, or a background refetch would clobber the user's local edits. Setting
  // `seeded` back to false (in the conflict branch) asks this effect to run again after a resync.
  useEffect(() => {
    if (!seeded && interviewQuery.data?.status === 200) {
      setAnswers(interviewQuery.data.data.answers as Answers)
      setSeeded(true)
    }
  }, [seeded, interviewQuery.data])

  const current = seeded ? nextStep(answers) : null

  // `current?.kind` flips from a question/gate to 'done' exactly once — once reached, this
  // component renders nothing and offers no further interaction, so the effect cannot re-fire.
  useEffect(() => {
    if (current?.kind === 'done') onDone()
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
    // The one extra render tick between "the GET resolved" and "the seeding effect committed" —
    // still an honest loading state, not a flash of the wrong question (see the effect above).
    return <LoadingState bp={bp} label={tr('interview.loading')} />
  }

  function answer(stepId: StepId, value: string) {
    setPostError(null)
    const previousAnswers = answers
    const previousHistory = history
    // Advance immediately — this is what keeps the Minimal-Gate inside ADR-016's 60-second
    // budget: nothing here waits on the network before showing the next screen.
    setHistory((h) => [...h, stepId])
    setAnswers((a) => ({ ...a, [stepId]: value }))

    postAnswer.mutate(
      { jahr: taxYear, data: { questionId: stepId, value } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            // The Cockpit's open-items count is this write's whole point — make its next render
            // fetch fresh rather than trust it'll happen to be stale enough to refetch on its own.
            void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
            return
          }
          // 400/409 — the server rejected a write the local graph believed valid/reachable. Undo
          // the optimistic step and resync from the server's own GET rather than trust local state
          // any further (a concurrent write from another session is the one legitimate way).
          setPostError(response.status === 409 ? 'conflict' : 'invalid')
          setHistory([])
          setSeeded(false)
          void interviewQuery.refetch()
        },
        onError: () => {
          // A genuine network failure: nothing was persisted, so simply undo the optimistic step —
          // no resync needed, `previousAnswers`/`previousHistory` are still what the server holds.
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
