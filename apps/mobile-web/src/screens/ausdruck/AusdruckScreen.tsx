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
  readonly onRiesterErgaenzen: () => void
  readonly onKinderErgaenzen: () => void
  readonly onVermietungErgaenzen: () => void
  readonly onKapitalErgaenzen: () => void
  readonly onGrenzgaengerErgaenzen: () => void
  readonly onBestaetigen: () => void
  readonly oeffneCheckout?: (url: string) => void
}

export function AusdruckScreen({ jahr, zahlung, onZurueck, onAngabenErgaenzen, onRiesterErgaenzen, onKinderErgaenzen, onVermietungErgaenzen, onKapitalErgaenzen, onGrenzgaengerErgaenzen, onBestaetigen, oeffneCheckout = (url) => window.location.assign(url) }: AusdruckScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makeDatenschutzStyles(theme)
  const { t } = useTranslation(APP_NS)
  const status = useFreischaltungControllerStatus(jahr)
  const pruefung = useAusdruckControllerPruefung(jahr)
  const checkout = useAusdruckControllerCheckout()
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [laedt, setLaedt] = useState(false)

  if (status.isPending || pruefung.isPending) return <LoadingState bp={bp} label={t('ausdruck.loading')} />
  if (pruefung.data?.status === 404) {
    return (
      <ErrorState
        bp={bp}
        heading={t('ausdruck.keineVordrucke.heading', { jahr })}
        message={t('ausdruck.keineVordrucke.message')}
        retryLabel={t('ausdruck.back')}
        onRetry={onZurueck}
      />
    )
  }
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
  const riester = fehlend.includes('riester')
  const kinder = fehlend.includes('kinder')
  const vermietung = fehlend.includes('vermietung')
  const kapital = fehlend.includes('kapital')
  const grenzgaenger = fehlend.includes('grenzgaenger')
  const anlagen = fehlend.filter((key) => key.startsWith('anlage'))
  const unbestaetigt = fehlend.filter((key) => key.startsWith('unbestaetigt.') && key !== 'unbestaetigt.personB').map((key) => key.slice('unbestaetigt.'.length))
  const personBUnbestaetigt = fehlend.includes('unbestaetigt.personB')
  const eigenerWeg = new Set(['ehegatte', 'riester', 'kinder', 'vermietung', 'kapital', 'grenzgaenger'])
  const stammdatenFehlen = fehlend.some((key) => !eigenerWeg.has(key) && !key.startsWith('anlage') && !key.startsWith('unbestaetigt.'))
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

  async function herunterladen(bearbeitbar = false) {
    setLaedt(true)
    setMeldung(null)
    try {
      const ergebnis = await ladeAusdruck(jahr, { bearbeitbar })
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
          {unbestaetigt.length > 0 ? (
            <>
              <Text style={styles.sectionBody}>
                {t('ausdruck.fehlendUnbestaetigt', { anlagen: unbestaetigt.map((a) => t(`bestaetigung.anlagen.${a}`)).join(', ') })}
              </Text>
              <Button variante="ghost" onPress={onBestaetigen}>
                {t('ausdruck.bestaetigungOeffnen')}
              </Button>
            </>
          ) : null}
          {personBUnbestaetigt ? <Text style={styles.sectionBody}>{t('ausdruck.fehlendPersonB')}</Text> : null}
          {stammdatenFehlen || verheiratet ? (
            <Button variante="ghost" onPress={onAngabenErgaenzen}>
              {t('ausdruck.angabenErgaenzen')}
            </Button>
          ) : null}
          {kinder ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendKinder')}</Text>
              <Button variante="ghost" onPress={onKinderErgaenzen}>
                {t('ausdruck.kinderErgaenzen')}
              </Button>
            </>
          ) : null}
          {grenzgaenger ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendGrenzgaenger')}</Text>
              <Button variante="ghost" onPress={onGrenzgaengerErgaenzen}>
                {t('ausdruck.grenzgaengerErgaenzen')}
              </Button>
            </>
          ) : null}
          {kapital ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendKapital')}</Text>
              <Button variante="ghost" onPress={onKapitalErgaenzen}>
                {t('ausdruck.kapitalErgaenzen')}
              </Button>
            </>
          ) : null}
          {vermietung ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendVermietung')}</Text>
              <Button variante="ghost" onPress={onVermietungErgaenzen}>
                {t('ausdruck.vermietungErgaenzen')}
              </Button>
            </>
          ) : null}
          {riester ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendRiester')}</Text>
              <Button variante="ghost" onPress={onRiesterErgaenzen}>
                {t('ausdruck.riesterErgaenzen')}
              </Button>
            </>
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
        <>
          <Button onPress={() => void herunterladen()} disabled={laedt || gesperrt} testID="ausdruck-herunterladen">
            {t('ausdruck.herunterladen')}
          </Button>
          <Button variante="ghost" onPress={() => void herunterladen(true)} disabled={laedt || gesperrt} testID="ausdruck-herunterladen-bearbeitbar">
            {t('ausdruck.herunterladenBearbeitbar')}
          </Button>
          <Text style={styles.hint}>{t('ausdruck.bearbeitbarHinweis')}</Text>
        </>
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
