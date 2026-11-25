import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { useLinkControllerConsent, useLinkControllerWithdrawConsent, type LinkResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { classifyApiFailure, useApiFailureMessage } from '../../net/apiFailure'
import { StepUpInline } from '../../auth/StepUpInline'
import { useConfirmAction } from '../../confirm/useConfirmAction'

/**
 * Decision 3 (API-3): Person B agrees per tax year, in B's own app. B sees the request and agrees here (with the
 * step-up: agreeing shows B's data to A). Person A sees that the year waits for B. Person B can take the consent
 * of a year back, after a confirmation and with the same step-up; A sees nothing of B for it from then on.
 */
export function PartnerYearConsent({ taxYear, current, onChanged }: { readonly taxYear: number; readonly current: LinkResponseDto; readonly onChanged: () => void }) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const consent = useLinkControllerConsent()
  const withdraw = useLinkControllerWithdrawConsent()
  const confirmWithdraw = useConfirmAction('partnerConsentWithdraw')
  const failureMessage = useApiFailureMessage()
  const [stepUp, setStepUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const settle = {
    onSuccess: () => {
      setStepUp(false)
      onChanged()
    },
    onError: (failure: unknown) => {
      if (classifyApiFailure(failure).kind === 'step-up') return setStepUp(true)
      setError(failureMessage(failure))
    },
  }

  const takeBack = () => {
    setError(null)
    withdraw.mutate({ jahr: taxYear }, settle)
  }

  if (current.consentGivenByMe === true) {
    return (
      <View testID="kopplung-zustimmung-gegeben">
        <Text style={{ ...theme.type.small, color: theme.color.tinte2, marginBottom: theme.space.s2 }}>{t('stammdaten.kopplungZustimmung.gegeben', { year: taxYear })}</Text>
        {error !== null ? (
          <Text style={{ ...theme.type.small, color: theme.color.fehler }} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {stepUp ? (
          <StepUpInline testID="kopplung-zustimmung-stepup" onConfirmed={takeBack} onCancel={() => setStepUp(false)} />
        ) : (
          <Button variant="ghost" onPress={() => confirmWithdraw.ask(takeBack, { jahr: taxYear })} disabled={withdraw.isPending} testID="kopplung-zustimmung-zuruecknehmen">
            {t('stammdaten.kopplungZustimmung.zuruecknehmen', { year: taxYear })}
          </Button>
        )}
        {confirmWithdraw.dialog}
      </View>
    )
  }

  if (current.consentRequestedFromMe !== true) {
    if (current.personBConsentPending !== true) return null
    return (
      <Text style={{ ...theme.type.small, color: theme.color.tinte2 }} testID="kopplung-zustimmung-ausstehend">
        {t('stammdaten.kopplungZustimmung.wartet', { year: taxYear })}
      </Text>
    )
  }

  const agree = () => {
    setError(null)
    consent.mutate({ jahr: taxYear }, settle)
  }

  return (
    <View testID="kopplung-zustimmung">
      <Text style={{ ...theme.type.body, color: theme.color.tinte, marginBottom: theme.space.s2 }}>
        {t('stammdaten.kopplungZustimmung.frage', { year: taxYear })}
      </Text>
      {error !== null ? (
        <Text style={{ ...theme.type.small, color: theme.color.fehler }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {stepUp ? (
        <StepUpInline testID="kopplung-zustimmung-stepup" onConfirmed={agree} onCancel={() => setStepUp(false)} />
      ) : (
        <Button onPress={agree} disabled={consent.isPending} testID="kopplung-zustimmen">
          {t('stammdaten.kopplungZustimmung.zustimmen', { year: taxYear })}
        </Button>
      )}
    </View>
  )
}
