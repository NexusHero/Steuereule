import { useState } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AiChip, Button, Card, Chip, Option, useBreakpoint, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  evaluateAdvisorTurn,
  formatEuro,
  PROFESSION_VALUES,
  type AdvisorActionProposal,
  type AdvisorChatMessageView,
  type CaseDigest,
  type OwlCardsDisplay,
  type Profession,
} from '@steuereule/core'
import {
  getAdvisorControllerGetSessionQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  useAdvisorControllerApplyAction,
  useAdvisorControllerGetSession,
  useAdvisorControllerSendMessage,
  useAdvisorControllerUndoAction,
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
import { AdvisorChatPanel } from './AdvisorChatPanel'

export interface OwlModeScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialCards?: readonly OwlCardsDisplay[] | undefined
  readonly initialMessages?: readonly AdvisorChatMessageView[] | undefined
  readonly onDismissCard?: ((fingerprint: string) => Promise<void> | void) | undefined
  readonly onAcceptPath?: ((cardId: string, pathIndex: number) => void) | undefined
  readonly optInEnabled?: boolean | undefined
  readonly onToggleOptIn?: ((enabled: boolean) => Promise<void> | void) | undefined
  /** The interview's occupation group; null = not chosen yet, undefined = no picker (not loaded). */
  readonly profession?: Profession | null | undefined
  readonly onChooseProfession?: ((profession: Profession) => Promise<void> | void) | undefined
  readonly onSendMessage?: ((text: string) => Promise<void> | void) | undefined
  readonly onApplyAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndoAction?: ((actionId: string) => Promise<void> | void) | undefined
}

function professionFrom(value: string | undefined): Profession | null {
  return (PROFESSION_VALUES as readonly string[]).includes(value ?? '') ? (value as Profession) : null
}

const DEFAULT_LOCAL_DIGEST: CaseDigest = {
  taxYear: CURRENT_TAX_YEAR,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: 62000, wageTaxEur: 11800, socialSecurityEur: 11400 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 18,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: ['stammdaten.iban'],
  estimatedRefundEur: 480,
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
  const sessionQuery = useAdvisorControllerGetSession(taxYear, { query: { retry: false } })
  const sendMessageMutation = useAdvisorControllerSendMessage()
  const applyActionMutation = useAdvisorControllerApplyAction()
  const undoActionMutation = useAdvisorControllerUndoAction()
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
          void sessionQuery.refetch()
        }}
      />
    )
  }

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
    ])
  }

  const cards: readonly OwlCardsDisplay[] = cardsQuery.data.data.cards.map((k) => ({
    ...k,
    amountEur: k.amountEur ?? null,
    ...(k.paths && k.paths.length === 2 ? { paths: [k.paths[0]!, k.paths[1]!] as const } : { paths: undefined }),
  }))

  const serverMessages =
    sessionQuery.data?.status === 200
      ? (sessionQuery.data.data.messages as unknown as readonly AdvisorChatMessageView[])
      : undefined

  return (
    <OwlModeScreenView
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      taxYear={taxYear}
      initialCards={cards}
      initialMessages={serverMessages}
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
        if (response.status !== 200) throw new Error(`profession not stored (HTTP ${response.status})`)
        await invalidate()
      }}
      onSendMessage={async (text) => {
        await sendMessageMutation.mutateAsync({ jahr: taxYear, data: { message: text } })
        await invalidate()
      }}
      onApplyAction={async (actionId) => {
        await applyActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
      onUndoAction={async (actionId) => {
        await undoActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
    />
  )
}

function updateActionStatusInMessage(
  msg: AdvisorChatMessageView,
  actionId: string,
  status: AdvisorActionProposal['status'],
): AdvisorChatMessageView {
  if (!msg.meta) return msg
  if (msg.meta.action?.actionId === actionId) {
    return {
      ...msg,
      meta: { ...msg.meta, action: { ...msg.meta.action, status } },
    }
  }
  if (msg.meta.twoPaths) {
    if (msg.meta.twoPaths.safePath.actionId === actionId) {
      return {
        ...msg,
        meta: {
          ...msg.meta,
          twoPaths: {
            ...msg.meta.twoPaths,
            safePath: { ...msg.meta.twoPaths.safePath, status },
          },
        },
      }
    }
    if (msg.meta.twoPaths.maxPath.actionId === actionId) {
      return {
        ...msg,
        meta: {
          ...msg.meta,
          twoPaths: {
            ...msg.meta.twoPaths,
            maxPath: { ...msg.meta.twoPaths.maxPath, status },
          },
        },
      }
    }
  }
  return msg
}

function OwlModeScreenView({
  onDone = () => {},
  onBack,
  taxYear = CURRENT_TAX_YEAR,
  initialCards = [],
  initialMessages,
  onDismissCard,
  onAcceptPath,
  optInEnabled = true,
  onToggleOptIn,
  profession,
  onChooseProfession,
  onSendMessage,
  onApplyAction,
  onUndoAction,
}: OwlModeScreenProps & { readonly initialCards: readonly OwlCardsDisplay[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const owl = useOwlEntrance()

  const [tab, setTab] = useState<'fragen' | 'eule'>('eule')
  const [cards, setCards] = useState<readonly OwlCardsDisplay[]>(initialCards)
  const [activeIndex, setActiveIndex] = useState(0)
  const [localMessages, setLocalMessages] = useState<readonly AdvisorChatMessageView[]>(initialMessages ?? [])
  const [isSending, setIsSending] = useState(false)

  const displayedMessages = initialMessages ?? localMessages
  const activeCard = cards[activeIndex]

  async function handleDismiss(fingerprint: string) {
    if (onDismissCard) await onDismissCard(fingerprint)
    const fresh = cards.filter((k) => k.fingerprint !== fingerprint)
    setCards(fresh)
    if (activeIndex >= fresh.length && fresh.length > 0) {
      setActiveIndex(fresh.length - 1)
    }
  }

  async function handleSendChat(text: string) {
    setIsSending(true)
    try {
      if (onSendMessage) {
        await onSendMessage(text)
        return
      }
      const userMsg: AdvisorChatMessageView = {
        id: `msg-u-${Date.now()}`,
        role: 'user',
        content: text,
        meta: null,
        createdAt: new Date().toISOString(),
      }
      const turn = evaluateAdvisorTurn({
        message: text,
        digest: {
          ...DEFAULT_LOCAL_DIGEST,
          taxYear,
          openOwlHints: cards.map((c) => ({
            id: c.id,
            fingerprint: c.fingerprint,
            title: c.title,
            message: c.message,
            sourceId: 'estg-9-1',
            amountEur: c.amountEur,
          })),
        },
      })
      const assistantMsg: AdvisorChatMessageView = {
        id: `msg-a-${Date.now() + 1}`,
        role: 'assistant',
        content: turn.replyText,
        meta: turn.meta,
        createdAt: new Date().toISOString(),
      }
      setLocalMessages((prev) => [...prev, userMsg, assistantMsg])
    } finally {
      setIsSending(false)
    }
  }

  async function handleClarifyCardWithEule(card: OwlCardsDisplay) {
    setTab('fragen')
    await handleSendChat(`${card.title}: ${card.message}`)
  }

  async function handleApplyAction(actionId: string) {
    if (onApplyAction) {
      await onApplyAction(actionId)
      return
    }
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'applied')))
  }

  async function handleUndoAction(actionId: string) {
    if (onUndoAction) {
      await onUndoAction(actionId)
      return
    }
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'undone')))
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
          <View style={styles.privacyBadge} testID="eule-privacy-badge">
            <Text style={styles.privacyBadgeText}>
              🔒 Mandantengeheimnis aktiv — Keine Klarnamen, Steuer-IDs oder IBANs an KI
            </Text>
          </View>
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
        <AdvisorChatPanel
          messages={displayedMessages}
          quickChips={[
            'Kanzlei-Endprüfung starten',
            'Homeoffice vs. Arbeitszimmer prüfen',
            'Fortbildung & Reisekosten klären',
            'Spenden aus dem Vorjahr prüfen',
          ]}
          isSending={isSending}
          onSendMessage={handleSendChat}
          onApplyAction={handleApplyAction}
          onUndoAction={handleUndoAction}
        />
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

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mit Eule klären"
                onPress={() => void handleClarifyCardWithEule(activeCard)}
                style={styles.clarifyButton}
                testID="card-clarify-with-eule"
              >
                <Text style={styles.clarifyButtonText}>Mit Eule klären 💬</Text>
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
    privacyBadge: {
      alignSelf: 'flex-start',
      backgroundColor: t.color.karte,
      borderRadius: t.radius.s,
      paddingHorizontal: t.space.s2,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: t.color.linie,
    } as ViewStyle,
    privacyBadgeText: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
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
    help: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      marginBottom: t.space.s2,
    } as TextStyle,
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
      flexWrap: 'wrap',
      gap: t.space.s2,
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
    clarifyButton: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.s,
      backgroundColor: t.color.tinte,
    } as ViewStyle,
    clarifyButtonText: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.grund,
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
