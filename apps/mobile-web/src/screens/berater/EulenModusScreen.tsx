import { useState } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Option, useBreakpoint, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro, type EulenKartenAnzeige } from '@steuereule/core'
import {
  getEulenModusControllerGetEinstellungQueryKey,
  getEulenModusControllerGetKartenQueryKey,
  useEulenModusControllerGetEinstellung,
  useEulenModusControllerGetKarten,
  useEulenModusControllerSetEinstellung,
  useEulenModusControllerVerwerfeKarte,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'

export interface EulenModusScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialKarten?: readonly EulenKartenAnzeige[] | undefined
  readonly onDismissKarte?: ((fingerprint: string) => Promise<void> | void) | undefined
  readonly onAcceptWeg?: ((karteId: string, wegIndex: number) => void) | undefined
  readonly optInAktiviert?: boolean | undefined
  readonly onToggleOptIn?: ((aktiviert: boolean) => Promise<void> | void) | undefined
}

export function EulenModusScreen(props: EulenModusScreenProps) {
  if (props.initialKarten !== undefined) {
    return <EulenModusScreenView {...props} initialKarten={props.initialKarten} />
  }
  return <ConnectedEulenModusScreen {...props} />
}

function ConnectedEulenModusScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, onAcceptWeg }: EulenModusScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const einstellungQuery = useEulenModusControllerGetEinstellung()
  const kartenQuery = useEulenModusControllerGetKarten(taxYear)
  const setEinstellung = useEulenModusControllerSetEinstellung()
  const verwerfeKarte = useEulenModusControllerVerwerfeKarte()

  if (einstellungQuery.isPending || kartenQuery.isPending) {
    return <LoadingState bp={bp} label={tr('eule.loading', 'Eulen-Modus wird geladen …')} />
  }
  if (einstellungQuery.isError || kartenQuery.isError || einstellungQuery.data.status !== 200 || kartenQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('eule.loadError.heading', 'Das hat nicht geklappt.')}
        message={tr('eule.loadError.message', 'Der Eulen-Modus konnte nicht geladen werden.')}
        retryLabel={tr('eule.loadError.retry', 'Noch mal versuchen')}
        onRetry={() => {
          void einstellungQuery.refetch()
          void kartenQuery.refetch()
        }}
      />
    )
  }

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getEulenModusControllerGetEinstellungQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getEulenModusControllerGetKartenQueryKey(taxYear) }),
    ])
  }

  const karten: readonly EulenKartenAnzeige[] = kartenQuery.data.data.karten.map((k) => ({
    ...k,
    betragEur: k.betragEur ?? null,
    ...(k.wege && k.wege.length === 2 ? { wege: [k.wege[0]!, k.wege[1]!] as const } : { wege: undefined }),
  }))

  return (
    <EulenModusScreenView
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      taxYear={taxYear}
      initialKarten={karten}
      optInAktiviert={einstellungQuery.data.data.aktiviert}
      onToggleOptIn={async (aktiviert) => {
        await setEinstellung.mutateAsync({ data: { aktiviert } })
        await invalidate()
      }}
      onDismissKarte={async (fingerprint) => {
        await verwerfeKarte.mutateAsync({ jahr: taxYear, fingerprint })
        await invalidate()
      }}
      {...(onAcceptWeg ? { onAcceptWeg } : {})}
    />
  )
}

function EulenModusScreenView({
  onDone = () => {},
  onBack,
  taxYear: _taxYear = CURRENT_TAX_YEAR,
  initialKarten = [],
  onDismissKarte,
  onAcceptWeg,
  optInAktiviert = true,
  onToggleOptIn,
}: EulenModusScreenProps & { readonly initialKarten: readonly EulenKartenAnzeige[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const [tab, setTab] = useState<'fragen' | 'eule'>('eule')
  const [karten, setKarten] = useState<readonly EulenKartenAnzeige[]>(initialKarten)
  const [aktiverIndex, setAktiverIndex] = useState(0)

  const aktiveKarte = karten[aktiverIndex]

  async function handleDismiss(fingerprint: string) {
    if (onDismissKarte) await onDismissKarte(fingerprint)
    const neu = karten.filter((k) => k.fingerprint !== fingerprint)
    setKarten(neu)
    if (aktiverIndex >= neu.length && neu.length > 0) {
      setAktiverIndex(neu.length - 1)
    }
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="eulen-modus-screen">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>

      {onToggleOptIn ? (
        <View style={{ marginBottom: t.space.s4 }}>
          <Option
            gewaehlt={optInAktiviert}
            onPress={() => void onToggleOptIn(!optInAktiviert)}
            testID="eulen-modus-opt-in"
          >
            {tr('eule.optInLabel', 'Eulen-Modus aktivieren (proaktive Hinweise ab 50 €, keine personenbezogenen Daten an KI)')}
          </Option>
        </View>
      ) : null}

      <View style={styles.tabBar}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'fragen' }}
          onPress={() => setTab('fragen')}
          style={[styles.tabButton, tab === 'fragen' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, tab === 'fragen' && styles.tabTextActive]}>
            {tr('eule.tabFragen', 'Fragen an die Eule')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'eule' }}
          onPress={() => setTab('eule')}
          style={[styles.tabButton, tab === 'eule' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, tab === 'eule' && styles.tabTextActive]}>
            {tr('eule.tabEule', 'Eule fragt dich')} · {karten.length}
          </Text>
        </Pressable>
      </View>

      {tab === 'fragen' ? (
        <View style={styles.chatPlaceholder}>
          <Text style={styles.heading}>{tr('eule.chatTitle', 'Steuer-Assistent')}</Text>
          <Text style={styles.help}>
            {tr(
              'eule.chatHelp',
              'Stelle Fragen zu deinen Werbungskosten, Freibeträgen oder Belegen. Antworten erfolgen transparent mit Angabe der Rechtsgrundlage.',
            )}
          </Text>
        </View>
      ) : karten.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{tr('eule.emptyTitle', 'Alles geprüft. Keine offenen Fragen!')}</Text>
          <Text style={styles.emptyHelp}>
            {tr(
              'eule.emptyHelp',
              'Deine Angaben sind schlüssig. Sobald neue Belege oder Gesetzesänderungen vorliegen, meldet sich die Eule wieder.',
            )}
          </Text>
          <Text style={styles.rechtsstand}>{tr('eule.rechtsstand', 'Rechtsstand: 01.01.2025 · Zuletzt geprüft: heute')}</Text>
        </Card>
      ) : aktiveKarte ? (
        <View>
          <Text style={styles.counter}>
            {tr('eule.counter', { current: aktiverIndex + 1, total: karten.length, defaultValue: `Frage ${aktiverIndex + 1} von ${karten.length}` })}
          </Text>
          <Card style={styles.kiCard}>
            <View style={styles.cardHeader}>
              <Chip aktiv>{aktiveKarte.titel}</Chip>
              {aktiveKarte.betragEur !== null && (
                <Text style={styles.betragBadge}>{`+${formatEuro(aktiveKarte.betragEur)}`}</Text>
              )}
            </View>

            <Text style={styles.botschaft}>{aktiveKarte.botschaft}</Text>
            <Text style={styles.begruendung}>{aktiveKarte.begruendung}</Text>

            {aktiveKarte.wege && (
              <View style={styles.wegeBlock}>
                <Text style={styles.wegeTitle}>{tr('eule.wegeTitle', 'Empfohlene Vorgehensweise (StBerG-Grenze):')}</Text>
                {aktiveKarte.wege.map((weg, idx) => (
                  <Pressable
                    key={weg.name}
                    accessibilityRole="button"
                    onPress={() => onAcceptWeg?.(aktiveKarte.id, idx)}
                    style={[styles.wegOption, weg.risiko === 'sicher' ? styles.wegSicher : styles.wegRisiko]}
                  >
                    <View style={styles.wegHeader}>
                      <Text style={styles.wegName}>{weg.name}</Text>
                      <Text style={styles.wegBetrag}>{formatEuro(weg.betragEur)}</Text>
                    </View>
                    <Text style={styles.wegDesc}>{weg.beschreibung}</Text>
                    <Text style={styles.wegBadge}>
                      {weg.risiko === 'sicher' ? '✓ Sicherer Weg' : '⚠ Riskanterer Weg'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.quelleRow}>
              <Text style={styles.quelleText}>{aktiveKarte.quelleUebersetzt}</Text>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stimmt nicht"
                onPress={() => handleDismiss(aktiveKarte.fingerprint)}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>{tr('eule.dismiss', 'Stimmt nicht')}</Text>
              </Pressable>
              {aktiverIndex < karten.length - 1 && (
                <Button
                  variante="ghost"
                  onPress={() => setAktiverIndex(aktiverIndex + 1)}
                  style={styles.nextButton}
                >
                  {tr('eule.next', 'Nächste Frage →')}
                </Button>
              )}
            </View>
          </Card>
        </View>
      ) : null}

      <Button onPress={onDone} style={styles.cta}>
        {tr('eule.fertig', 'Zurück zum Cockpit')}
      </Button>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const kiColor = t.color.ki
  const kiBg = t.color.kiWeich

  return {
    screen: {
      backgroundColor: t.color.grund,
      paddingHorizontal: t.space.s5,
      paddingVertical: t.space.s6,
      minHeight: '100%',
      maxWidth: 460,
      width: '100%',
      alignSelf: 'center',
    } as ViewStyle,
    wideScreen: {
      backgroundColor: t.color.grund,
      paddingHorizontal: t.space.s5,
      paddingVertical: t.space.s6,
      maxWidth: WIDE_CONTENT_MAX_WIDTH,
      alignSelf: 'center',
      width: '100%',
      minHeight: '100%',
    } as ViewStyle,
    headerRow: {
      marginBottom: t.space.s4,
    } as ViewStyle,
    tabBar: {
      flexDirection: 'row',
      backgroundColor: t.color.karte,
      borderRadius: t.radius.m,
      padding: 4,
      marginBottom: t.space.s5,
    } as ViewStyle,
    tabButton: {
      flex: 1,
      paddingVertical: t.space.s2,
      alignItems: 'center',
      borderRadius: t.radius.s,
    } as ViewStyle,
    tabButtonActive: {
      backgroundColor: t.color.grund,
    } as ViewStyle,
    tabText: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
    } as TextStyle,
    tabTextActive: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      color: t.color.tinte,
    } as TextStyle,
    heading: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size['2xl'],
      color: t.color.tinte,
      marginBottom: t.space.s2,
    } as TextStyle,
    help: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      marginBottom: t.space.s4,
    } as TextStyle,
    chatPlaceholder: {
      padding: t.space.s4,
    } as ViewStyle,
    emptyCard: {
      padding: t.space.s5,
      borderRadius: t.radius.m,
      backgroundColor: t.color.karte,
      alignItems: 'center',
      marginVertical: t.space.s4,
    } as ViewStyle,
    emptyTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.l,
      color: t.color.tinte,
      marginBottom: t.space.s2,
      textAlign: 'center',
    } as TextStyle,
    emptyHelp: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      textAlign: 'center',
      marginBottom: t.space.s4,
    } as TextStyle,
    rechtsstand: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    counter: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
      marginBottom: t.space.s2,
    } as TextStyle,
    kiCard: {
      padding: t.space.s5,
      borderRadius: t.radius.m,
      backgroundColor: kiBg,
      borderWidth: 2,
      borderColor: '#DDD6FE',
      marginBottom: t.space.s4,
    } as ViewStyle,
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.space.s3,
    } as ViewStyle,
    betragBadge: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.l,
      color: kiColor,
    } as TextStyle,
    botschaft: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.xl,
      color: t.color.tinte,
      marginBottom: t.space.s2,
      lineHeight: 26,
    } as TextStyle,
    begruendung: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      marginBottom: t.space.s4,
      lineHeight: 20,
    } as TextStyle,
    wegeBlock: {
      marginTop: t.space.s2,
      marginBottom: t.space.s4,
    } as ViewStyle,
    wegeTitle: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
      marginBottom: t.space.s2,
    } as TextStyle,
    wegOption: {
      padding: t.space.s3,
      borderRadius: t.radius.s,
      backgroundColor: t.color.karte,
      borderWidth: t.space.kontur,
      marginBottom: t.space.s2,
    } as ViewStyle,
    wegSicher: {
      borderColor: t.color.ok,
    } as ViewStyle,
    wegRisiko: {
      borderColor: t.color.warn,
    } as ViewStyle,
    wegHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    } as ViewStyle,
    wegName: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    wegBetrag: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    wegDesc: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
      marginTop: 2,
    } as TextStyle,
    wegBadge: {
      fontFamily: t.font.text,
      fontSize: 11,
      color: t.color.tinte2,
      marginTop: 4,
    } as TextStyle,
    quelleRow: {
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
      paddingTop: t.space.s2,
      marginBottom: t.space.s4,
    } as ViewStyle,
    quelleText: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    } as ViewStyle,
    dismissButton: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
    } as ViewStyle,
    dismissText: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.fehler,
    } as TextStyle,
    nextButton: {
      marginLeft: 'auto',
    } as ViewStyle,
    cta: {
      marginTop: t.space.s4,
      marginBottom: t.space.s6,
    } as ViewStyle,
  }
}
