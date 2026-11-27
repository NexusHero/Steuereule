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
import { modelProviderList } from '@steuereule/core'
import { APP_NS } from '../../../i18n/resources'

/**
 * Consent card under an owl answer that needed (or received) personal data without consent (ADR-0091).
 * Shown only while consent is not granted; "Nicht erlauben" just hides it for this message.
 * After "Erlauben" the conversation goes on by itself (`onGranted`), nobody types anything twice.
 */
export interface PersonalDataConsentCardProps {
  /** Called once the consent is stored: the chat answers the user's last message again, now with it. */
  readonly onGranted?: (() => void) | undefined
  /**
   * The provider of the model this conversation asks. The card no longer names only this one: the
   * consent is one for every provider the API can call (fallback, model choice), and the card says so.
   */
  readonly provider?: string | null | undefined
}

export function PersonalDataConsentCard({ onGranted }: PersonalDataConsentCardProps = {}) {
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
    backgroundColor: theme.color.warnWeich,
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
        <Text style={body}>{tr(onGranted ? 'owlPersonalData.card.grantedContinues' : 'owlPersonalData.card.granted')}</Text>
      </View>
    )
  }

  const granted = consent.data?.data.granted === true
  // Not loaded (or failed): the card asks nothing — the chat says so when an answer needs the consent.
  if (dismissed || granted || !consent.isSuccess) return null

  async function allow() {
    setFailed(false)
    try {
      await setConsent.mutateAsync({ data: { granted: true } })
      setJustGranted(true)
      await queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetPersonalDataConsentQueryKey() })
      onGranted?.()
    } catch {
      setFailed(true)
    }
  }

  return (
    <View style={box} accessibilityRole="alert" accessibilityLabel={tr('owlPersonalData.card.title')}>
      <Text style={title}>{tr('owlPersonalData.card.title')}</Text>
      <Text style={body}>{tr('owlPersonalData.card.body', { providers: modelProviderList() })}</Text>
      {failed ? <Text style={body}>{tr('owlPersonalData.card.error')}</Text> : null}
      <View style={actions}>
        <Button variant="tinte" onPress={() => void allow()} disabled={setConsent.isPending}>
          {setConsent.isPending ? tr('owlPersonalData.card.saving') : tr('owlPersonalData.card.allow')}
        </Button>
        <Button variant="ghost" onPress={() => setDismissed(true)} disabled={setConsent.isPending}>
          {tr('owlPersonalData.card.deny')}
        </Button>
      </View>
    </View>
  )
}
