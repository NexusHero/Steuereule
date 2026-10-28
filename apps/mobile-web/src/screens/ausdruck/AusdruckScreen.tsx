// Formular-Ausdruck (ADR-0050): the one place where the user unlocks, downloads and is told
// how to hand in the paper return. Also the return target of the Stripe checkout
// (`?zahlung=erfolg|abbruch`) — the redirect proves nothing, so "erfolg" only shows a
// waiting state until the server, confirmed by the webhook, says `freigeschaltet`.
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
import {
  useAusdruckControllerCheckout,
  useAusdruckControllerPruefung,
  useFreischaltungControllerStatus,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makeDatenschutzStyles } from '../datenschutz/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { ladeAusdruck } from './ausdruckDownload'

export interface AusdruckScreenProps {
  readonly jahr: number
  readonly zahlung?: 'erfolg' | 'abbruch'
  readonly onZurueck: () => void
  readonly onAngabenErgaenzen: () => void
  /** Hands the browser to the hosted checkout page. Injected so tests never leave the page. */
  readonly oeffneCheckout?: (url: string) => void
}

export function AusdruckScreen({ jahr, zahlung, onZurueck, onAngabenErgaenzen, oeffneCheckout = (url) => window.location.assign(url) }: AusdruckScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makeDatenschutzStyles(theme)
  const { t } = useTranslation(APP_NS)
  const status = useFreischaltungControllerStatus(jahr)
  // The server's own pre-check: Stammdaten gaps, married, and Anlagen not printable yet —
  // shown before paying, so nobody pays for a printout that cannot be delivered.
  const pruefung = useAusdruckControllerPruefung(jahr)
  const checkout = useAusdruckControllerCheckout()
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [laedt, setLaedt] = useState(false)

  if (status.isPending || pruefung.isPending) return <LoadingState bp={bp} label={t('ausdruck.loading')} />
  if (status.data?.status !== 200 || pruefung.data?.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={t('ausdruck.loadError.heading')}
        message={t('ausdruck.loadError.message')}
        retryLabel={t('ausdruck.loadError.retry')}
        onRetry={() => {
          void status.refetch()
          void pruefung.refetch()
        }}
      />
    )
  }

  const freischaltung = status.data.data.status
  const fehlend = pruefung.data.data.fehlend
  const verheiratet = fehlend.includes('ehegatte')
  const anlagen = fehlend.filter((key) => key.startsWith('anlage'))
  const stammdatenFehlen = fehlend.some((key) => key !== 'ehegatte' && !key.startsWith('anlage'))
  const gesperrt = fehlend.length > 0

  function bezahlen() {
    setMeldung(null)
    checkout.mutate(
      { jahr },
      {
        onSuccess: (response) => {
          if (response.status === 200) oeffneCheckout(response.data.checkoutUrl)
          else setMeldung({ art: 'fehler', text: t('ausdruck.fehler') })
        },
        onError: () => setMeldung({ art: 'fehler', text: t('ausdruck.fehler') }),
      },
    )
  }

  async function herunterladen() {
    setLaedt(true)
    setMeldung(null)
    try {
      const ergebnis = await ladeAusdruck(jahr)
      setMeldung(ergebnis.ok ? { art: 'ok', text: t('ausdruck.heruntergeladen') } : { art: 'fehler', text: t('ausdruck.fehler') })
      if (!ergebnis.ok && ergebnis.status === 422) void pruefung.refetch()
    } catch {
      setMeldung({ art: 'fehler', text: t('ausdruck.fehler') })
    } finally {
      setLaedt(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('ausdruck.back')} onPress={onZurueck} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('ausdruck.title', { jahr })}</Text>
      </View>
      <Text style={styles.sectionBody}>{t('ausdruck.intro')}</Text>

      {gesperrt ? (
        <Card style={{ marginBottom: theme.space.s4 }}>
          <Text style={styles.sectionTitle}>{t('ausdruck.fehlendTitel')}</Text>
          {stammdatenFehlen ? <Text style={styles.sectionBody}>{t('ausdruck.fehlendAngaben')}</Text> : null}
          {verheiratet ? <Text style={styles.sectionBody}>{t('ausdruck.fehlendEhegatte')}</Text> : null}
          {anlagen.map((anlage) => (
            <Text key={anlage} style={styles.sectionBody}>
              {t('ausdruck.anlageNochNicht', { anlage: t(`ausdruck.anlagen.${anlage}`) })}
            </Text>
          ))}
          {stammdatenFehlen ? (
            <Button variante="ghost" onPress={onAngabenErgaenzen}>
              {t('ausdruck.angabenErgaenzen')}
            </Button>
          ) : null}
        </Card>
      ) : null}

      {zahlung === 'abbruch' && freischaltung !== 'freigeschaltet' ? <Text style={styles.hint}>{t('ausdruck.zahlungAbgebrochen')}</Text> : null}

      {freischaltung === 'nicht-verfuegbar' ? <Text style={styles.sectionBody}>{t('ausdruck.nichtVerfuegbar')}</Text> : null}

      {freischaltung === 'offen' && zahlung === 'erfolg' ? (
        <View style={{ gap: theme.space.s3 }}>
          <Text style={styles.sectionBody} accessibilityLiveRegion="polite">
            {t('ausdruck.zahlungLaeuft')}
          </Text>
          <Button variante="ghost" onPress={() => void status.refetch()}>
            {t('ausdruck.aktualisieren')}
          </Button>
        </View>
      ) : null}

      {freischaltung === 'offen' && zahlung !== 'erfolg' ? (
        <View style={{ gap: theme.space.s2 }}>
          <Button onPress={bezahlen} disabled={checkout.isPending || gesperrt} testID="ausdruck-bezahlen">
            {t('ausdruck.freischalten')}
          </Button>
          <Text style={styles.hint}>{t('ausdruck.freischaltenHinweis')}</Text>
        </View>
      ) : null}

      {freischaltung === 'freigeschaltet' ? (
        <Button onPress={() => void herunterladen()} disabled={laedt || gesperrt} testID="ausdruck-herunterladen">
          {t('ausdruck.herunterladen')}
        </Button>
      ) : null}

      {meldung ? (
        <Text style={meldung.art === 'ok' ? styles.successNote : styles.errorNote} accessibilityLiveRegion="polite">
          {meldung.text}
        </Text>
      ) : null}

      <View style={{ marginTop: theme.space.s5 }}>
        <Text style={styles.sectionTitle}>{t('ausdruck.hinweiseTitel')}</Text>
        {(t('ausdruck.hinweise', { returnObjects: true }) as string[]).map((hinweis) => (
          <Text key={hinweis} style={styles.sectionBody}>
            • {hinweis}
          </Text>
        ))}
        <Text style={styles.hint}>{t('ausdruck.hinweisEdaten')}</Text>
      </View>
    </ScrollView>
  )
}
