import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, useTheme } from '@steuereule/ui'
import {
  getOwlModeControllerGetPersonalDataConsentQueryKey,
  useOwlModeControllerGetPersonalDataConsent,
  useOwlModeControllerSetPersonalDataConsent,
} from '@steuereule/api-client'
import { modelProviderList } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makePrivacyStyles } from './styles'
import { useApiFailureMessage } from '../../net/apiFailure'

/** Datenschutz section: the owl's consent to process personal data (ADR-0091), revocable at any time. */
export function OwlPersonalDataSection() {
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makePrivacyStyles(useTheme())
  const queryClient = useQueryClient()
  const consent = useOwlModeControllerGetPersonalDataConsent()
  const setConsent = useOwlModeControllerSetPersonalDataConsent()
  const [saveError, setSaveError] = useState<unknown>(null)
  const failureMessage = useApiFailureMessage()

  const loaded = consent.data?.data ?? null
  const granted = loaded?.granted === true

  async function update(next: boolean) {
    setSaveError(null)
    try {
      await setConsent.mutateAsync({ data: { granted: next } })
    } catch (error) {
      setSaveError(error)
    }
    // Either way the section shows what the server holds now.
    await queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetPersonalDataConsentQueryKey() })
  }

  // NR-20: a failed load is a failure with a retry, not a "Wird geladen …" that never ends (and no way to revoke).
  if (consent.isError) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>{tr('owlPersonalData.section.title')}</Text>
        <Text style={styles.hint} accessibilityRole="alert" testID="eulen-einwilligung-ladefehler">
          {failureMessage(consent.error)}
        </Text>
        <Button variant="ghost" onPress={() => void consent.refetch()} testID="eulen-einwilligung-erneut">
          {tr('apiFehler.retry')}
        </Button>
      </Card>
    )
  }

  const since = granted && loaded?.grantedAt
    ? new Date(loaded.grantedAt).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'UTC' })
    : ''
  const stateText = loaded === null
    ? tr('owlPersonalData.section.stateLoading')
    : granted
      ? tr('owlPersonalData.section.stateGranted', { date: since })
      : tr('owlPersonalData.section.stateNotGranted')

  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('owlPersonalData.section.title')}</Text>
      <Text style={styles.sectionBody}>{tr('owlPersonalData.section.body', { providers: modelProviderList() })}</Text>
      <Text style={styles.sectionTitle} accessibilityRole="text">{stateText}</Text>
      {saveError !== null ? (
        <Text style={styles.hint} accessibilityRole="alert">
          {failureMessage(saveError, { server: tr('owlPersonalData.section.error'), unknown: tr('owlPersonalData.section.error') })}
        </Text>
      ) : null}
      {loaded !== null ? (
        <Button variant={granted ? 'ghost' : 'primaer'} onPress={() => void update(!granted)} disabled={setConsent.isPending}>
          {granted ? tr('owlPersonalData.section.revoke') : tr('owlPersonalData.section.allow')}
        </Button>
      ) : null}
    </Card>
  )
}
