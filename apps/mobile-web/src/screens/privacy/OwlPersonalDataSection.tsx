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
import { APP_NS } from '../../i18n/resources'
import { makePrivacyStyles } from './styles'

/** Datenschutz section: the owl's consent to process personal data (ADR-0091), revocable at any time. */
export function OwlPersonalDataSection() {
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makePrivacyStyles(useTheme())
  const queryClient = useQueryClient()
  const consent = useOwlModeControllerGetPersonalDataConsent()
  const setConsent = useOwlModeControllerSetPersonalDataConsent()
  const [failed, setFailed] = useState(false)

  const loaded = consent.data?.status === 200 ? consent.data.data : null
  const granted = loaded?.granted === true

  async function update(next: boolean) {
    setFailed(false)
    try {
      const result = await setConsent.mutateAsync({ data: { granted: next } })
      if (result.status !== 200) {
        setFailed(true)
        return
      }
      await queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetPersonalDataConsentQueryKey() })
    } catch {
      setFailed(true)
    }
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
      <Text style={styles.sectionBody}>{tr('owlPersonalData.section.body')}</Text>
      <Text style={styles.sectionTitle} accessibilityRole="text">{stateText}</Text>
      {failed ? <Text style={styles.hint}>{tr('owlPersonalData.section.error')}</Text> : null}
      {loaded !== null ? (
        <Button variant={granted ? 'ghost' : 'primaer'} onPress={() => void update(!granted)} disabled={setConsent.isPending}>
          {granted ? tr('owlPersonalData.section.revoke') : tr('owlPersonalData.section.allow')}
        </Button>
      ) : null}
    </Card>
  )
}
