import { useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, useTheme } from '@steuereule/ui'
import {
  getOwlModeControllerGetPersonalDataConsentQueryKey,
  useOwlModeControllerGetPersonalDataConsent,
  useOwlModeControllerSetPersonalDataConsent,
} from '@steuereule/api-client'
import { APP_NS } from '../../../i18n/resources'

/**
 * Consent card under an owl answer that needed (or received) personal data without consent (ADR-0091).
 * Shown only while consent is not granted; "Nicht erlauben" just hides it for this message.
 */
export function PersonalDataConsentCard() {
  const { t: tr } = useTranslation(APP_NS)
  const theme = useTheme()
  const queryClient = useQueryClient()
  const consent = useOwlModeControllerGetPersonalDataConsent()
  const setConsent = useOwlModeControllerSetPersonalDataConsent()
  const [dismissed, setDismissed] = useState(false)
  const [justGranted, setJustGranted] = useState(false)
  const [failed, setFailed] = useState(false)

  const box: ViewStyle = {
    marginTop: theme.space.s3,
    padding: theme.space.s3,
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.fehlerWeich,
    borderLeftWidth: 3,
    borderLeftColor: theme.color.warn,
    gap: theme.space.s2,
  }
  const title: TextStyle = { ...theme.type.emphasis, color: theme.color.tinte }
  const body: TextStyle = { ...theme.type.small, color: theme.color.tinte2 }
  const actions: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 }

  if (justGranted) {
    return (
      <View style={box} accessibilityRole="alert">
        <Text style={body}>{tr('owlPersonalData.card.granted')}</Text>
      </View>
    )
  }

  const granted = consent.data?.status === 200 && consent.data.data.granted
  if (dismissed || granted || consent.data?.status !== 200) return null

  async function allow() {
    setFailed(false)
    try {
      const result = await setConsent.mutateAsync({ data: { granted: true } })
      if (result.status !== 200) {
        setFailed(true)
        return
      }
      setJustGranted(true)
      await queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetPersonalDataConsentQueryKey() })
    } catch {
      setFailed(true)
    }
  }

  return (
    <View style={box} accessibilityRole="alert" accessibilityLabel={tr('owlPersonalData.card.title')}>
      <Text style={title}>{tr('owlPersonalData.card.title')}</Text>
      <Text style={body}>{tr('owlPersonalData.card.body')}</Text>
      {failed ? <Text style={body}>{tr('owlPersonalData.card.error')}</Text> : null}
      <View style={actions}>
        <Button variant="primaer" onPress={() => void allow()} disabled={setConsent.isPending}>
          {setConsent.isPending ? tr('owlPersonalData.card.saving') : tr('owlPersonalData.card.allow')}
        </Button>
        <Button variant="ghost" onPress={() => setDismissed(true)} disabled={setConsent.isPending}>
          {tr('owlPersonalData.card.deny')}
        </Button>
      </View>
    </View>
  )
}
