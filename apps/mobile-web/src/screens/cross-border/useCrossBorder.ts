import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { type Answers, type EntryQuestionId } from '@steuereule/core'
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
  type PutNGreDto,
  type PutProvisionDto,
} from '@steuereule/api-client'
import { usePendingMutations } from '../shared/usePendingMutations'
import { triggerSaveErrorHaptic, watchSaveResult } from '../shared/saveFeedback'

export type SetFieldVars = Parameters<ReturnType<typeof useChSalaryCertificateControllerSetField>['mutate']>[0]
export type SetExchangeRateVars = Parameters<ReturnType<typeof useChSalaryCertificateControllerSetExchangeRate>['mutate']>[0]

/** Reads and writes of the Grenzgänger mask: the CH interview (or the partner's facts) and the Lohnausweis. */
export function useCrossBorder(taxYear: number, forPartner: boolean) {
  const queryClient = useQueryClient()
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

  const onSetField = (vars: SetFieldVars) => track(watchSaveResult(setField.mutateAsync({ ...vars, ...(params ? { params } : {}) })).then(invalidateCertificate))
  const onSetExchangeRate = (vars: SetExchangeRateVars) => track(watchSaveResult(setExchangeRate.mutateAsync({ ...vars, ...(params ? { params } : {}) })).then(invalidateCertificate))
  const onSetProvision = (data: PutProvisionDto) => track(watchSaveResult(setProvision.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) })).then(invalidateCertificate))
  const onSetNGre = (data: PutNGreDto) => track(watchSaveResult(setNGre.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) })).then(invalidateCertificate))

  return {
    interviewQuery,
    salaryCertificateQuery,
    interviewPending,
    interviewFailed,
    interviewAnswers,
    seeded,
    partnerResidence,
    setPartnerResidence,
    answer,
    answerForPartner,
    onSetField,
    onSetExchangeRate,
    onSetProvision,
    onSetNGre,
    finish,
    saveFailed,
  }
}
