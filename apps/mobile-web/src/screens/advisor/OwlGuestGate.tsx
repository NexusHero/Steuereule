// What a guest sees in place of the owl: it needs an account.
import { ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { BackButton } from '../shared/BackButton'
import { OwlMark } from '../../marks/OwlMark'
import { useOwlEntrance } from '../../marks/useOwlEntrance'
import { makeStyles } from './OwlModeScreen'
import type { OwlModeScreenProps } from './OwlModeScreen'

export function GuestOwlGate({ onDone = () => {}, onBack, onRegister, onLogin }: OwlModeScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const owl = useOwlEntrance()

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="eulen-modus-screen">
      {onBack ? (
        <View style={styles.headerRow}>
          <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} />
        </View>
      ) : null}

      <View style={styles.hero} testID="eule-hero">
        <OwlMark variant="tinte" size={72} {...owl} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle} role="heading" aria-level={1}>
            {tr('eule.heroTitle', 'Deine Eule')}
          </Text>
          <Text style={styles.help}>
            {tr('eule.heroBody', 'Sie kennt dein Steuerjahr und sagt dir, wo Geld liegen bleibt — mit Rechtsgrundlage, damit du selbst entscheidest.')}
          </Text>
          <View style={styles.privacyBadge} testID="eule-privacy-badge">
            <Text style={styles.privacyBadgeText}>
              🔒 Mandantengeheimnis aktiv — Keine Klarnamen, Steuer-IDs oder IBANs an KI
            </Text>
          </View>
        </View>
      </View>

      <Card variant="ai" style={styles.guestCard} testID="eule-guest-konto-wand">
        <Text style={styles.guestTitle}>{tr('eule.guest.title', 'Eulen-Modus erfordert ein kostenloses Konto')}</Text>
        <Text style={styles.guestBody}>
          {tr(
            'eule.guest.body',
            'Für die KI-Steuerberatung und Belegprüfung speichern wir deine Entwürfe verschlüsselt in deinem Konto. Als Gast startet hier kein KI-Abruf.',
          )}
        </Text>
        <View style={styles.guestActions}>
          {onRegister ? (
            <Button onPress={onRegister} testID="eule-guest-register-btn">
              {tr('eule.guest.register', 'Konto anlegen')}
            </Button>
          ) : null}
          {onLogin ? (
            <Button variant="ghost" onPress={onLogin} testID="eule-guest-login-btn">
              {tr('eule.guest.login', 'Einloggen')}
            </Button>
          ) : null}
          <Button variant="leise" onPress={onDone} testID="eule-guest-back-btn">
            {tr('eule.fertig', 'Zurück zum Cockpit')}
          </Button>
        </View>
      </Card>
    </ScrollView>
  )
}
