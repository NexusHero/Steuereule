import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '@steuereule/ui'
import { ENTRIES, nextStepFor } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { Text } from 'react-native'
import { useTheme } from '@steuereule/ui'
import { LoadingState, LoadFailedState } from '../shared/ScreenState'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { useCrossBorder } from './useCrossBorder'
import { ChInterviewStep } from './CrossBorderInterviewStep'
import { SalaryCertificateStep } from './CrossBorderSalaryCertificate'

export interface CrossBorderScreenProps {
  readonly onDone: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's Swiss figures (ADR-0054, partner without an own account). */
  readonly partnerName?: string
}

const SEGMENT_CH = ENTRIES['segment-ch']

export function CrossBorderScreen({ onDone, onBack, taxYear = CURRENT_TAX_YEAR, partnerName }: CrossBorderScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const forPartner = partnerName !== undefined
  const {
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
    saveError,
    answerError,
  } = useCrossBorder(taxYear, forPartner)
  const theme = useTheme()

  if (interviewPending || salaryCertificateQuery.isPending) {
    return <LoadingState bp={bp} label={tr('grenzgaenger.loading')} />
  }
  if (interviewFailed || salaryCertificateQuery.isError) {
    return (
      <LoadFailedState
        bp={bp}
        error={interviewFailed ? interviewQuery.error : salaryCertificateQuery.error}
        onRetry={() => {
          if (!forPartner) void interviewQuery.refetch()
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

  if (step !== null && step.kind === 'question') {
    return (
      <>
        {answerError !== null ? (
          <Text style={{ ...theme.type.small, color: theme.color.fehler, margin: theme.space.s4 }} accessibilityRole="alert" testID="ch-antwort-fehler">
            {`${answerError} ${tr('grenzgaenger.antwortZurueck')}`}
          </Text>
        ) : null}
        <SaveFailedNotice visible={forPartner && saveError !== null} error={saveError} />
        <ChInterviewStep
        stepId={step.id}
        onAnswer={forPartner ? answerForPartner : answer}
        bp={bp}
        onBack={() => (forPartner && partnerResidence !== null ? setPartnerResidence(null) : finish(onBack ?? onDone))}
        {...(partnerName !== undefined ? { partnerName } : {})}
        />
      </>
    )
  }

  return (
    <>
      <SaveFailedNotice visible={saveFailed || saveError !== null} error={saveError} />
      <SalaryCertificateStep
        salaryCertificate={salaryCertificate}
        taxYear={taxYear}
        {...(partnerName !== undefined ? { partnerName } : {})}
        onSetField={onSetField}
        onSetExchangeRate={onSetExchangeRate}
        onSetProvision={onSetProvision}
        onSetNGre={onSetNGre}
        onDone={() => finish(onDone)}
        {...(onBack ? { onBack: () => finish(onBack) } : {})}
        bp={bp}
      />
    </>
  )
}
