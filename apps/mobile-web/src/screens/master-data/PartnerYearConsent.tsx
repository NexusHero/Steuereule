import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { useLinkControllerConsent, type LinkResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { classifyApiFailure, useApiFailureMessage } from '../../net/apiFailure'
import { StepUpInline } from '../../auth/StepUpInline'

/**
 * Decision 3 (API-3): Person B agrees per tax year, in B's own app. B sees the request and agrees here (with the
 * step-up: agreeing shows B's data to A). Person A sees that the year waits for B.
 */
export function PartnerYearConsent({ taxYear, current, onChanged }: { readonly taxYear: number; readonly current: LinkResponseDto; readonly onChanged: () => void }) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const consent = useLinkControllerConsent()
  const failureMessage = useApiFailureMessage()
  const [stepUp, setStepUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    consent.mutate(
      { jahr: taxYear },
      {
        onSuccess: () => {
          setStepUp(false)
          onChanged()
        },
        onError: (failure) => {
          if (classifyApiFailure(failure).kind === 'step-up') return setStepUp(true)
          setError(failureMessage(failure))
        },
      },
    )
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
