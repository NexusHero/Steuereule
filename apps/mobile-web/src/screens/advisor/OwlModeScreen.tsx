import { useState } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AiChip, Button, Card, Chip, Option, useBreakpoint, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro, PROFESSION_VALUES, type OwlCardsDisplay, type Profession } from '@steuereule/core'
import {
  getOwlModeControllerGetSettingQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  useOwlModeControllerGetSetting,
  useOwlModeControllerGetCards,
  useOwlModeControllerSetSetting,
  useOwlModeControllerDismissCard,
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  getInterviewControllerGetInterviewQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { OwlMark } from '../../marks/OwlMark'
import { useOwlEntrance } from '../../marks/useOwlEntrance'
import { ProfessionPicker } from './ProfessionPicker'

export interface OwlModeScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialCards?: readonly OwlCardsDisplay[] | undefined
  readonly onDismissCard?: ((fingerprint: string) => Promise<void> | void) | undefined
  readonly onAcceptPath?: ((cardId: string, pathIndex: number) => void) | undefined
  readonly optInEnabled?: boolean | undefined
  readonly onToggleOptIn?: ((enabled: boolean) => Promise<void> | void) | undefined
  /** The interview's occupation group; null = not chosen yet, undefined = no picker (not loaded). */
  readonly profession?: Profession | null | undefined
  readonly onChooseProfession?: ((profession: Profession) => Promise<void> | void) | undefined
}

function professionFrom(value: string | undefined): Profession | null {
  return (PROFESSION_VALUES as readonly string[]).includes(value ?? '') ? (value as Profession) : null
}

export function OwlModeScreen(props: OwlModeScreenProps) {
  if (props.initialCards !== undefined) {
    return <OwlModeScreenView {...props} initialCards={props.initialCards} />
  }
  return <ConnectedOwlModeScreen {...props} />
}

function ConnectedOwlModeScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, onAcceptPath }: OwlModeScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const settingQuery = useOwlModeControllerGetSetting()
  const cardsQuery = useOwlModeControllerGetCards(taxYear)
  const setSetting = useOwlModeControllerSetSetting()
  const dismissCard = useOwlModeControllerDismissCard()
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  const postAnswer = useInterviewControllerPostAnswer()
  const interviewAnswers = interviewQuery.data?.status === 200 ? (interviewQuery.data.data.answers as Record<string, string>) : undefined

  if (settingQuery.isPending || cardsQuery.isPending) {
    return <LoadingState bp={bp} label={tr('eule.loading', 'Eulen-Modus wird geladen …')} />
  }
  if (settingQuery.isError || cardsQuery.isError || settingQuery.data.status !== 200 || cardsQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('eule.loadError.heading', 'Das hat nicht geklappt.')}
        message={tr('eule.loadError.message', 'Der Eulen-Modus konnte nicht geladen werden.')}
        retryLabel={tr('eule.loadError.retry', 'Noch mal versuchen')}
        onRetry={() => {
          void settingQuery.refetch()
          void cardsQuery.refetch()
        }}
      />
    )
  }

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
    ])
  }

  const cards: readonly OwlCardsDisplay[] = cardsQuery.data.data.cards.map((k) => ({
    ...k,
    amountEur: k.amountEur ?? null,
    ...(k.paths && k.paths.length === 2 ? { paths: [k.paths[0]!, k.paths[1]!] as const } : { paths: undefined }),
  }))

  return (
    <OwlModeScreenView
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      taxYear={taxYear}
      initialCards={cards}
      optInEnabled={settingQuery.data.data.enabled}
      onToggleOptIn={async (enabled) => {
        await setSetting.mutateAsync({ data: { enabled } })
        await invalidate()
      }}
      onDismissCard={async (fingerprint) => {
        await dismissCard.mutateAsync({ jahr: taxYear, fingerprint })
        await invalidate()
      }}
      {...(onAcceptPath ? { onAcceptPath } : {})}
      profession={interviewAnswers === undefined ? undefined : professionFrom(interviewAnswers['beruf'])}
      onChooseProfession={async (profession) => {
        const response = await postAnswer.mutateAsync({ jahr: taxYear, data: { questionId: 'beruf', value: profession } })
        if (response.status !== 200) return
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
          invalidate(),
        ])
      }}
    />
  )
}

function OwlModeScreenView({
  onDone = () => {},
  onBack,
  taxYear: _taxYear = CURRENT_TAX_YEAR,
  initialCards = [],
  onDismissCard,
  onAcceptPath,
  optInEnabled = true,
  onToggleOptIn,
  profession,
  onChooseProfession,
}: OwlModeScreenProps & { readonly initialCards: readonly OwlCardsDisplay[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const owl = useOwlEntrance()

  const [tab, setTab] = useState<'fragen' | 'eule'>('eule')
  const [cards, setCards] = useState<readonly OwlCardsDisplay[]>(initialCards)
  const [activeIndex, setActiveIndex] = useState(0)

  const activeCard = cards[activeIndex]

  async function handleDismiss(fingerprint: string) {
    if (onDismissCard) await onDismissCard(fingerprint)
    const fresh = cards.filter((k) => k.fingerprint !== fingerprint)
    setCards(fresh)
    if (activeIndex >= fresh.length && fresh.length > 0) {
      setActiveIndex(fresh.length - 1)
    }
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="eulen-modus-screen">
      {onBack ? (
        <View style={styles.headerRow}>
          <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} />
        </View>
      ) : null}

      {/* The owl is your advisor: it greets you at the top of its own tab. */}
      <View style={styles.hero} testID="eule-hero">
        <OwlMark variant="tinte" size={72} {...owl} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle} role="heading" aria-level={1}>
            {tr('eule.heroTitle', 'Deine Eule')}
          </Text>
          <Text style={styles.help}>
            {tr('eule.heroBody', 'Sie kennt dein Steuerjahr und sagt dir, wo Geld liegen bleibt — mit Rechtsgrundlage, damit du selbst entscheidest.')}
          </Text>
        </View>
      </View>

      {profession !== undefined && onChooseProfession ? (
        <ProfessionPicker profession={profession} onChoose={onChooseProfession} />
      ) : null}

      {onToggleOptIn ? (
        <View style={{ marginBottom: t.space.s4 }}>
          <Option
            selected={optInEnabled}
            onPress={() => void onToggleOptIn(!optInEnabled)}
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
            {tr('eule.tabEule', 'Eule fragt dich')} · {cards.length}
          </Text>
        </Pressable>
      </View>

      {tab === 'fragen' ? (
        <View style={styles.chatPlaceholder}>
          <AiChip style={styles.sender} testID="eule-sender-chat">{tr('eule.sender', 'Die Eule')}</AiChip>
          <Text style={styles.heading}>{tr('eule.chatTitle', 'Steuer-Assistent')}</Text>
          <Text style={styles.help}>
            {tr(
              'eule.chatHelp',
              'Stelle Fragen zu deinen Werbungskosten, Freibeträgen oder Belegen. Antworten erfolgen transparent mit Angabe der Rechtsgrundlage.',
            )}
          </Text>
        </View>
      ) : cards.length === 0 ? (
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
      ) : activeCard ? (
        <View>
          <Text style={styles.counter}>
            {tr('eule.counter', { current: activeIndex + 1, total: cards.length, defaultValue: `Frage ${activeIndex + 1} von ${cards.length}` })}
          </Text>
          <Card style={styles.kiCard}>
            {/* The advisor speaks as the owl — every proactive hint is signed by it. */}
            <AiChip style={styles.sender} testID="eule-sender-card">{tr('eule.sender', 'Die Eule')}</AiChip>
            <View style={styles.cardHeader}>
              <Chip active>{activeCard.title}</Chip>
              {activeCard.amountEur !== null && (
                <Text style={styles.betragBadge}>{`+${formatEuro(activeCard.amountEur)}`}</Text>
              )}
            </View>

            <Text style={styles.botschaft}>{activeCard.message}</Text>
            <Text style={styles.begruendung}>{activeCard.reason}</Text>

            {activeCard.paths && (
              <View style={styles.wegeBlock}>
                <Text style={styles.wegeTitle}>{tr('eule.wegeTitle', 'Empfohlene Vorgehensweise (StBerG-Grenze):')}</Text>
                {activeCard.paths.map((path, idx) => (
                  <Pressable
                    key={path.name}
                    accessibilityRole="button"
                    onPress={() => onAcceptPath?.(activeCard.id, idx)}
                    style={[styles.wegOption, path.risk === 'sicher' ? styles.wegSicher : styles.wegRisiko]}
                  >
                    <View style={styles.wegHeader}>
                      <Text style={styles.wegName}>{path.name}</Text>
                      <Text style={styles.wegBetrag}>{formatEuro(path.amountEur)}</Text>
                    </View>
                    <Text style={styles.wegDesc}>{path.description}</Text>
                    <Text style={styles.wegBadge}>
                      {path.risk === 'sicher' ? '✓ Sicherer Weg' : '⚠ Riskanterer Weg'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.quelleRow}>
              <Text style={styles.quelleText}>{activeCard.sourceTranslated}</Text>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stimmt nicht"
                onPress={() => handleDismiss(activeCard.fingerprint)}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>{tr('eule.dismiss', 'Stimmt nicht')}</Text>
              </Pressable>
              {activeIndex < cards.length - 1 && (
                <Button
                  variant="ghost"
                  onPress={() => setActiveIndex(activeIndex + 1)}
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
    hero: { flexDirection: 'row', alignItems: 'center', gap: t.space.s4, marginBottom: t.space.s5 } as ViewStyle,
    heroCopy: { flex: 1, flexShrink: 1 } as ViewStyle,
    heroTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size['2xl'],
      color: t.color.tinte,
      marginBottom: t.space.s1,
    } as TextStyle,
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
    sender: {
      marginBottom: t.space.s3,
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
