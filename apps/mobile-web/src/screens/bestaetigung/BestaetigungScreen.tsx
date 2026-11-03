// REQ-032 (ADR-0052 §6/§7) — „Prüfen & bestätigen“: every value the user did not enter themselves
// (Jahresübernahme, later the assistant) is shown per Anlage with its Herkunft; the user confirms
// the Anlage or changes values one by one in their mask. A proposal never overwrote anything —
// the user accepts or discards it here.
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import {
  useBestaetigungControllerBestaetigeAnlage,
  useBestaetigungControllerEntscheideVorschlag,
  useBestaetigungControllerGet,
  type AnlageBestaetigungDto,
  type HerkunftDto,
  type KennzeichnungWertDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makeDatenschutzStyles } from '../datenschutz/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'

export type BestaetigungsMaske = KennzeichnungWertDto['maske']

export interface BestaetigungScreenProps {
  readonly jahr: number
  readonly onZurueck: () => void
  /** Opens the mask a value belongs to, where the user changes it themselves. */
  readonly onMaskeOeffnen: (maske: BestaetigungsMaske) => void
}

type Tr = ReturnType<typeof useTranslation>['t']

// Fields whose stored string is a year, an age or a choice — everything else is whole euros.
const KEINE_BETRAEGE = new Set(['rente.rentenbeginnJahr', 'rente.alterBeiRentenbeginn', 'rente.rentenart', 'vermietung.baujahr'])

function herkunftText(tr: Tr, h: HerkunftDto): string {
  switch (h.art) {
    case 'nutzer':
      return tr('bestaetigung.herkunft.nutzer')
    case 'uebernahme':
      return tr('bestaetigung.herkunft.uebernahme', { vorjahr: h.vorjahr })
    case 'assistent':
      return h.belegId ? tr('bestaetigung.herkunft.assistentBeleg', { name: h.name }) : tr('bestaetigung.herkunft.assistent', { name: h.name })
    case 'beleg':
      return tr('bestaetigung.herkunft.beleg')
  }
}

function feldLabel(tr: Tr, w: KennzeichnungWertDto): string {
  if (w.maske === 'kapital' && w.feld === 'kapitalertraege') return tr('kapital.feld.label')
  if (w.maske === 'rente' && w.feld === 'rentenart') return tr('bestaetigung.felder.rentenart')
  if (w.maske === 'lstb' || w.maske === 'rente' || w.maske === 'kapital' || w.maske === 'vermietung') {
    return tr(`${w.maske}.felder.${w.feld}`, { defaultValue: w.feld })
  }
  return w.feld
}

function wertText(tr: Tr, w: KennzeichnungWertDto, wert: string | null): string {
  if (wert === null) return tr('bestaetigung.leererWert')
  if (wert === 'unklar') return tr('bestaetigung.unklar')
  if (w.maske === 'rente' && w.feld === 'rentenart') return tr(`rente.arten.${wert}`, { defaultValue: wert })
  const betrag = Number(wert)
  if (KEINE_BETRAEGE.has(`${w.maske}.${w.feld}`) || !Number.isFinite(betrag)) return wert
  return formatEuro(betrag)
}

export function BestaetigungScreen({ jahr, onZurueck, onMaskeOeffnen }: BestaetigungScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makeDatenschutzStyles(theme)
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const uebersicht = useBestaetigungControllerGet(jahr)
  const bestaetige = useBestaetigungControllerBestaetigeAnlage()
  const entscheide = useBestaetigungControllerEntscheideVorschlag()
  const [fehler, setFehler] = useState(false)

  if (uebersicht.isPending) return <LoadingState bp={bp} label={t('bestaetigung.loading')} />
  if (uebersicht.data?.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={t('bestaetigung.loadError.heading')}
        message={t('bestaetigung.loadError.message')}
        retryLabel={t('bestaetigung.loadError.retry')}
        onRetry={() => void uebersicht.refetch()}
      />
    )
  }
  const { anlagen } = uebersicht.data.data

  // Cockpit, Vorprüfung and the masks all read what a confirmation changes.
  const nachAenderung = async (aktion: () => Promise<{ status: number }>) => {
    setFehler(false)
    try {
      const ergebnis = await aktion()
      if (ergebnis.status !== 200) setFehler(true)
    } catch {
      setFehler(true)
    }
    await queryClient.invalidateQueries()
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('bestaetigung.back')} onPress={onZurueck} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('bestaetigung.title', { jahr })}</Text>
      </View>

      {anlagen.length === 0 ? (
        <Text style={styles.sectionBody}>{t('bestaetigung.leer')}</Text>
      ) : (
        <Text style={styles.sectionBody}>{t('bestaetigung.intro')}</Text>
      )}
      {fehler ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {t('bestaetigung.fehler')}
        </Text>
      ) : null}

      {anlagen.map((anlage: AnlageBestaetigungDto) => {
        const anlageName = t(`bestaetigung.anlagen.${anlage.anlage}`)
        const ersteMaske = anlage.werte[0]?.maske
        return (
          <Card key={anlage.anlage} style={{ marginBottom: theme.space.s4 }} testID={`anlage-${anlage.anlage}`}>
            <Text style={styles.sectionTitle}>{anlageName}</Text>
            <Text style={styles.hint}>
              {anlage.unbestaetigt > 0 ? t('bestaetigung.unbestaetigt', { count: anlage.unbestaetigt }) : t('bestaetigung.nurVorschlaege')}
            </Text>
            {anlage.werte.map((w) => (
              <View key={w.key} style={{ gap: theme.space.s1, marginTop: theme.space.s3 }}>
                <Text style={styles.sectionBody}>{feldLabel(t, w)}</Text>
                <Text style={styles.sectionTitle}>{wertText(t, w, w.wert)}</Text>
                <Text style={styles.hint}>{herkunftText(t, w.herkunft)}</Text>
                {w.vorschlag ? (
                  <View style={{ gap: theme.space.s2 }}>
                    <Text style={styles.sectionBody}>
                      {t('bestaetigung.vorschlag', {
                        herkunft: herkunftText(t, w.vorschlag.herkunft),
                        neu: wertText(t, w, w.vorschlag.wert),
                        alt: wertText(t, w, w.wert),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: theme.space.s2 }}>
                      <Button
                        variante="ghost"
                        disabled={entscheide.isPending}
                        testID={`vorschlag-annehmen-${w.key}`}
                        onPress={() => void nachAenderung(() => entscheide.mutateAsync({ jahr, key: w.key, data: { entscheidung: 'annehmen' } }))}
                      >
                        {t('bestaetigung.vorschlagAnnehmen')}
                      </Button>
                      <Button
                        variante="ghost"
                        disabled={entscheide.isPending}
                        testID={`vorschlag-verwerfen-${w.key}`}
                        onPress={() => void nachAenderung(() => entscheide.mutateAsync({ jahr, key: w.key, data: { entscheidung: 'verwerfen' } }))}
                      >
                        {t('bestaetigung.vorschlagVerwerfen')}
                      </Button>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
            <View style={{ gap: theme.space.s2, marginTop: theme.space.s4 }}>
              {anlage.unbestaetigt > 0 ? (
                <Button
                  disabled={bestaetige.isPending}
                  testID={`bestaetige-${anlage.anlage}`}
                  onPress={() => void nachAenderung(() => bestaetige.mutateAsync({ jahr, anlage: anlage.anlage }))}
                >
                  {t('bestaetigung.anlageBestaetigen', { anlage: anlageName })}
                </Button>
              ) : null}
              {ersteMaske ? (
                <Button variante="ghost" testID={`aendern-${anlage.anlage}`} onPress={() => onMaskeOeffnen(ersteMaske)}>
                  {t('bestaetigung.einzelnAendern')}
                </Button>
              ) : null}
            </View>
          </Card>
        )
      })}
    </ScrollView>
  )
}
