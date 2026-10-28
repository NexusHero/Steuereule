// Erklärungs-Stammdaten (ADR-0050) — what page 1 of ESt 1 A needs beyond name and Steuer-ID,
// reached from Profil. Religion is only saved with the explicit Art. 9 consent tick; the
// server enforces the same rule, this screen only makes it visible before the request.
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Feld, Input, Option, useBreakpoint, useTheme } from '@steuereule/ui'
import { FAMILIENSTAENDE, RELIGIONSSCHLUESSEL } from '@steuereule/core'
import { useStammdatenControllerLese, useStammdatenControllerSpeichere } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makeDatenschutzStyles } from '../datenschutz/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { zuEntwurf, zuPutDto, type StammdatenEntwurf } from './stammdatenMapping'

export interface StammdatenScreenProps {
  readonly onZurueck: () => void
}

type TextFeld = Exclude<keyof StammdatenEntwurf, 'religion' | 'religionEinwilligung' | 'familienstand'>

export function StammdatenScreen({ onZurueck }: StammdatenScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makeDatenschutzStyles(theme)
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useStammdatenControllerLese()
  const speichern = useStammdatenControllerSpeichere()
  const [entwurf, setEntwurf] = useState<StammdatenEntwurf | null>(null)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)

  if (query.isPending) return <LoadingState bp={bp} label={t('stammdaten.loading')} />
  if (query.isError || query.data?.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={t('stammdaten.loadError.heading')}
        message={t('stammdaten.loadError.message')}
        retryLabel={t('stammdaten.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const stand = query.data.data
  const form = entwurf ?? zuEntwurf(stand)
  const setze = (patch: Partial<StammdatenEntwurf>) => {
    setMeldung(null)
    setEntwurf({ ...form, ...patch })
  }
  const textFeld = (feld: TextFeld, type: 'text' | 'numeric' = 'text') => (
    <Feld label={t(`stammdaten.${feld}`)}>
      <Input type={type} value={form[feld]} onChange={(wert) => setze({ [feld]: wert })} testID={`stammdaten-${feld}`} />
    </Feld>
  )

  function absenden() {
    if (form.religion !== null && !form.religionEinwilligung) {
      setMeldung({ art: 'fehler', text: t('stammdaten.saveError.einwilligung') })
      return
    }
    speichern.mutate(
      { data: zuPutDto(form) },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            queryClient.setQueryData(query.queryKey, response)
            setEntwurf(null)
            setMeldung({ art: 'ok', text: t('stammdaten.gespeichert') })
          } else {
            setMeldung({ art: 'fehler', text: t('stammdaten.saveError.validation') })
          }
        },
        onError: () => setMeldung({ art: 'fehler', text: t('stammdaten.saveError.network') }),
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('stammdaten.back')} onPress={onZurueck} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('stammdaten.title')}</Text>
      </View>
      <Text style={styles.sectionBody}>{t('stammdaten.intro')}</Text>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {stand.fehlend.length === 0 ? t('stammdaten.vollstaendig') : t('stammdaten.fehlendHinweis', { anzahl: stand.fehlend.length })}
      </Text>

      {textFeld('geburtsdatum')}
      {textFeld('beruf')}
      {textFeld('strasse')}
      <View style={{ flexDirection: 'row', gap: theme.space.s3 }}>
        <View style={{ flex: 1 }}>{textFeld('hausnummer')}</View>
        <View style={{ flex: 1 }}>{textFeld('hausnummerZusatz')}</View>
      </View>
      {textFeld('plz', 'numeric')}
      {textFeld('wohnort')}

      <Feld label={t('stammdaten.familienstand')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 }}>
          {FAMILIENSTAENDE.map((stand_) => (
            <Chip key={stand_} aktiv={form.familienstand === stand_} onPress={() => setze({ familienstand: stand_ })}>
              {t(`stammdaten.familienstaende.${stand_}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.familienstand !== null && form.familienstand !== 'ledig' ? textFeld('familienstandSeit') : null}

      <Feld label={t('stammdaten.religion')}>
        <Text style={styles.hint}>{t('stammdaten.religionHinweis')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: theme.space.s2 }}>
          {RELIGIONSSCHLUESSEL.map((schluessel) => (
            <Chip key={schluessel} aktiv={form.religion === schluessel} onPress={() => setze({ religion: schluessel })}>
              {t(`stammdaten.religionen.${schluessel}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.religion !== null ? (
        <Option
          gewaehlt={form.religionEinwilligung}
          onPress={() => setze({ religionEinwilligung: !form.religionEinwilligung })}
          testID="stammdaten-einwilligung"
        >
          {t('stammdaten.einwilligung')}
        </Option>
      ) : null}

      {textFeld('iban')}
      {textFeld('kontoinhaber')}
      {textFeld('finanzamt')}
      {textFeld('telefon')}

      {meldung ? (
        <Text style={meldung.art === 'ok' ? styles.successNote : styles.errorNote} accessibilityLiveRegion="polite">
          {meldung.text}
        </Text>
      ) : null}
      <View style={styles.buttonSpacer}>
        <Button onPress={absenden} disabled={speichern.isPending} testID="stammdaten-speichern">
          {t('stammdaten.speichern')}
        </Button>
      </View>
    </ScrollView>
  )
}
