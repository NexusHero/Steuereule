import { useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
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
  type Screen,
} from '@steuereule/core'
import {
  getAdvisorControllerGetSessionQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  useAdvisorControllerApplyAction,
  useAdvisorControllerGetSession,
  useAdvisorControllerSendMessage,
  useAdvisorControllerUndoAction,
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  useOwlModeControllerDismissCard,
  useOwlModeControllerGetCards,
  useOwlModeControllerGetSetting,
  useOwlModeControllerSetSetting,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { OwlMark } from '../../marks/OwlMark'
import { useOwlEntrance } from '../../marks/useOwlEntrance'
import { LstbScreen } from '../lstb/LstbScreen'
import { WorkdaysScreen } from '../workdays/WorkdaysScreen'
import { CrossBorderScreen } from '../cross-border/CrossBorderScreen'
import { PensionerScreen } from '../pension/PensionerScreen'
import { CapitalScreen } from '../capital/CapitalScreen'
import { RentalScreen } from '../rental/RentalScreen'
import { ChildrenScreen } from '../children/ChildrenScreen'
import { AssessmentScreen } from '../assessment/AssessmentScreen'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { MasterDataScreen } from '../master-data/MasterDataScreen'
import { ProfessionPicker } from './ProfessionPicker'
import { AdvisorChatPanel } from './AdvisorChatPanel'
import { invalidateAllTaxQueries, useOptionalCopilotBridge, type OwlViewMode } from './CopilotBridgeProvider'

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
  readonly isGuest?: boolean | undefined
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
}

const AI_MANUAL_ONLY_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

function professionFrom(value: string | undefined): Profession | null {
  return (PROFESSION_VALUES as readonly string[]).includes(value ?? '') ? (value as Profession) : null
}

function extractPendingDrafts(messages: readonly AdvisorChatMessageView[]): readonly AdvisorActionProposal[] {
  const seen = new Set<string>()
  const drafts: AdvisorActionProposal[] = []
  for (const msg of messages) {
    const candidates: AdvisorActionProposal[] = []
    if (msg.meta?.action) candidates.push(msg.meta.action)
    if (msg.meta?.twoPaths) {
      candidates.push(msg.meta.twoPaths.safePath, msg.meta.twoPaths.maxPath)
    }
    for (const candidate of candidates) {
      if (candidate.status === 'pending' && !seen.has(candidate.actionId)) {
        seen.add(candidate.actionId)
        drafts.push(candidate)
      }
    }
  }
  return drafts
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
  const bridge = useOptionalCopilotBridge()
  const blockedAsGuest = props.isGuest === true || bridge?.isAuthenticated === false
  if (blockedAsGuest && props.initialCards === undefined) {
    return <GuestOwlGate {...props} />
  }
  if (props.initialCards !== undefined) {
    return <OwlModeScreenView {...props} initialCards={props.initialCards} />
  }
  return <ConnectedOwlModeScreen {...props} />
}

function GuestOwlGate({ onDone = () => {}, onBack, onRegister, onLogin }: OwlModeScreenProps) {
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

function ConnectedOwlModeScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, onAcceptPath }: OwlModeScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const bridge = useOptionalCopilotBridge()
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
    if (bridge) {
      await invalidateAllTaxQueries(queryClient, taxYear)
      return
    }
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
        if (bridge) {
          const activeScreen = bridge.owlViewMode.kind === 'mask' ? bridge.owlViewMode.screen : undefined
          await bridge.sendStreamingMessage(text, activeScreen)
          return
        }
        await sendMessageMutation.mutateAsync({ jahr: taxYear, data: { message: text } })
        await invalidate()
      }}
      onApplyAction={async (actionId) => {
        if (bridge) {
          await bridge.applySingleAction(actionId)
          return
        }
        await applyActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
      onUndoAction={async (actionId) => {
        if (bridge) {
          await bridge.undoSingleAction(actionId)
          return
        }
        await undoActionMutation.mutateAsync({ jahr: taxYear, actionId })
        await invalidate()
      }}
    />
  )
}

function InlineMaskView({
  screen,
  field,
  taxYear,
  onBack,
  styles,
}: {
  readonly screen: Screen
  readonly field?: string | undefined
  readonly taxYear: number
  readonly onBack: () => void
  readonly styles: ReturnType<typeof makeStyles>
}) {
  const { t: tr } = useTranslation(APP_NS)
  const isManualOnly = AI_MANUAL_ONLY_SCREENS.has(screen)

  function renderMask(): ReactNode {
    if (isManualOnly) {
      return (
        <View>
          <Card variant="default" style={styles.manualNoticeCard} testID="eule-manual-only-notice">
            <Text style={styles.manualNoticeText}>
              {tr(
                'eule.workspace.manualNotice',
                'Diese Maske enthält Stammdaten und ist für automatische KI-Änderungen gesperrt (Manuelle Eingabe).',
              )}
            </Text>
          </Card>
          {screen === 'stammdaten' || screen === 'kopplung' ? (
            <MasterDataScreen taxYear={taxYear} onBack={onBack} />
          ) : null}
        </View>
      )
    }

    switch (screen) {
      case 'lstb':
        return <LstbScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'commute':
        return <WorkdaysScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'chLohnausweis':
        return <CrossBorderScreen taxYear={taxYear} onDone={onBack} />
      case 'rente':
        return <PensionerScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'kapital':
        return <CapitalScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'vermietung':
        return <RentalScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'kind':
        return <ChildrenScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'assessment':
        return <AssessmentScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'interview':
        return <CatalogScreen entry="sonderausgaben" taxYear={taxYear} revisit onDone={onBack} onBack={onBack} />
    }
  }

  return (
    <View style={styles.inlineMaskWrap} testID="eule-inline-mask-view">
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.backToStageBtn}
        testID="eule-back-to-stage-btn"
      >
        <Text style={styles.backToStageText}>
          {tr('eule.workspace.backToStage', '← Zurück zu den Eulen-Änderungen')}
        </Text>
      </Pressable>
      <View style={styles.inlineMaskFocusBanner} testID="eule-inline-mask-focus-banner">
        <Text style={styles.inlineMaskFocusText}>
          {tr('eule.workspace.maskFocus', '🦉 Eulen-Fokus · Prüfe deine Maske')}
          {field ? ` · ${field}` : ''}
        </Text>
      </View>
      {renderMask()}
    </View>
  )
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
  const bridge = useOptionalCopilotBridge()

  const [tab, setTab] = useState<'fragen' | 'eule'>('eule')
  const [desktopChatOpen, setDesktopChatOpen] = useState(true)
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [dockInput, setDockInput] = useState('')
  const [cards, setCards] = useState<readonly OwlCardsDisplay[]>(initialCards)
  const [activeIndex, setActiveIndex] = useState(0)
  const [localMessages, setLocalMessages] = useState<readonly AdvisorChatMessageView[]>(initialMessages ?? [])
  const [localViewMode, setLocalViewMode] = useState<OwlViewMode>({ kind: 'stage' })
  const [isSending, setIsSending] = useState(false)
  const nextLocalMsgIdRef = useRef(1)

  const displayedMessages = initialMessages ?? localMessages
  const activeCard = cards[activeIndex]
  const pendingDrafts = extractPendingDrafts(displayedMessages)
  const viewMode = bridge ? bridge.owlViewMode : localViewMode
  const effectiveSending = isSending || (bridge?.streaming ?? false)

  function handleInspectMask(screen: Screen, field?: string) {
    if (bridge) {
      bridge.openMaskPreview(screen, field)
      return
    }
    setLocalViewMode(field === undefined ? { kind: 'mask', screen } : { kind: 'mask', screen, field })
  }

  function handleReturnToStage() {
    if (bridge) {
      bridge.returnToStage()
      return
    }
    setLocalViewMode({ kind: 'stage' })
  }

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
      if (bridge && bridge.isAuthenticated) {
        const res = await bridge.sendStreamingMessage(text, viewMode.kind === 'mask' ? viewMode.screen : undefined)
        if (res && res.length > 0) {
          setLocalMessages((prev) => [...prev, ...res])
          return
        }
      }
      const userMsg: AdvisorChatMessageView = {
        id: `msg-u-${nextLocalMsgIdRef.current++}`,
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
        id: `msg-a-${nextLocalMsgIdRef.current++}`,
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
    if (bp === 's') setTab('fragen')
    else if (bp === 'm') setTabletDrawerOpen(true)
    else setDesktopChatOpen(true)
    await handleSendChat(`${card.title}: ${card.message}`)
  }

  async function handleApplyAction(actionId: string) {
    if (onApplyAction) {
      await onApplyAction(actionId)
      return
    }
    if (bridge) {
      const ok = await bridge.applySingleAction(actionId)
      if (!ok) return
    }
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'applied')))
  }

  async function handleUndoAction(actionId: string) {
    if (onUndoAction) {
      await onUndoAction(actionId)
      return
    }
    if (bridge) {
      const ok = await bridge.undoSingleAction(actionId)
      if (!ok) return
    }
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'undone')))
  }

  async function handleBatchApply(acceptCurrentValues = false) {
    if (pendingDrafts.length === 0) return
    if (bridge) {
      const acknowledgedConflict = acceptCurrentValues ? (bridge.staleConflict ?? undefined) : undefined
      const ok = await bridge.applyAllPending(pendingDrafts, acknowledgedConflict ? { acknowledgedConflict } : undefined)
      if (ok) {
        for (const d of pendingDrafts) {
          setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, d.actionId, 'applied')))
        }
      }
      return
    }
    for (const d of pendingDrafts) {
      await handleApplyAction(d.actionId)
    }
    onDone()
  }

  const handleAttachReceipt = bridge
    ? async (input: { readonly fileName: string; readonly rawText: string }) => {
        await bridge.parseReceipt({ fileName: input.fileName, rawText: input.rawText, stageDraft: true })
      }
    : undefined

  function renderChatPanel(compact = false) {
    return (
      <AdvisorChatPanel
        messages={displayedMessages}
        quickChips={[
          'Kanzlei-Endprüfung starten',
          'Homeoffice vs. Arbeitszimmer prüfen',
          'Fortbildung & Reisekosten klären',
          'Spenden aus dem Vorjahr prüfen',
        ]}
        isSending={effectiveSending}
        streamSteps={bridge?.streamSteps}
        streamedText={bridge?.streamedText}
        chatError={bridge?.chatError}
        basisMode={bridge?.basisMode}
        onSendMessage={handleSendChat}
        onApplyAction={handleApplyAction}
        onUndoAction={handleUndoAction}
        onInspectMask={handleInspectMask}
        receiptLinkedActionIds={bridge?.receiptLinkedActionIds}
        onAttachReceipt={handleAttachReceipt}
        isParsingReceipt={bridge?.parsingReceipt}
        compact={compact}
      />
    )
  }

  function renderHeroAndSettings() {
    return (
      <>
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
      </>
    )
  }

  function renderWorkbenchBody() {
    if (viewMode.kind === 'mask') {
      return (
        <InlineMaskView
          screen={viewMode.screen}
          field={viewMode.field}
          taxYear={taxYear}
          onBack={handleReturnToStage}
          styles={styles}
        />
      )
    }

    return (
      <>
        {bridge?.lastParsedReceipt ? (
          <Card variant="ai" style={styles.receiptResultCard} testID="eule-receipt-result">
            <Text style={styles.draftSectionTitle}>
              {tr('eule.workspace.receiptResultTitle', {
                fileName: bridge.lastParsedReceipt.parsed.suggestedField ?? bridge.lastParsedReceipt.parsed.vendorCategory,
                defaultValue: `Beleg geprüft: ${bridge.lastParsedReceipt.parsed.vendorCategory}`,
              })}
            </Text>
            <Text style={styles.help}>{bridge.lastParsedReceipt.parsed.summary}</Text>
            {bridge.lastParsedReceipt.securityBlocked ? (
              <Text style={styles.conflictText}>
                {tr('eule.workspace.receiptBlocked', '⚠️ Sensibler Inhalt geschwärzt (Mandantengeheimnis)')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {bridge?.staleConflict ? (
          <Card variant="default" style={styles.conflictCard} testID="eule-stale-conflict-banner">
            <Text style={styles.conflictTitle}>{tr('eule.workspace.conflictTitle', '⚠️ Konflikt beim Übernehmen')}</Text>
            <Text style={styles.conflictText}>{bridge.staleConflict.message}</Text>
            <View style={styles.conflictActions}>
              <Button
                onPress={() => void handleBatchApply(true)}
                disabled={bridge.batchApplying}
                style={{ flex: 1 }}
                testID="eule-force-apply-btn"
              >
                {tr('eule.workspace.forceApply', 'Mit neuem Stand trotzdem übernehmen')}
              </Button>
              <Button
                variant="ghost"
                onPress={() => bridge.clearStaleConflict()}
                style={{ flex: 1 }}
                testID="eule-conflict-dismiss-btn"
              >
                {tr('eule.workspace.dismissConflict', 'Schließen')}
              </Button>
            </View>
          </Card>
        ) : null}

        {pendingDrafts.length > 0 ? (
          <Card variant="ai" style={styles.draftStageCard} testID="eule-draft-stage">
            <Text style={styles.draftSectionTitle}>
              {tr('eule.workspace.draftStageTitle', {
                count: pendingDrafts.length,
                defaultValue: `Vorbereitete Änderungen (${pendingDrafts.length})`,
              })}
            </Text>
            <View style={styles.draftList}>
              {pendingDrafts.map((draft) => {
                const isReceipt = bridge?.receiptLinkedActionIds.has(draft.actionId) ?? false
                const isZeroPauschbetrag =
                  draft.deltaEur === 0 && (draft.sourceId.startsWith('estg-9') || draft.sourceId === 'estg-4-5-6c')
                return (
                  <View key={draft.actionId} style={styles.draftRowCard} testID={`draft-card-${draft.actionId}`}>
                    <View style={styles.draftTopRow}>
                      <Text style={styles.draftTitle}>{draft.label}</Text>
                      {draft.deltaEur > 0 ? (
                        <Text style={styles.draftDelta}>{`+${formatEuro(draft.deltaEur)}`}</Text>
                      ) : isZeroPauschbetrag ? (
                        <Text style={styles.draftMutedBadge}>
                          {tr('eule.workspace.pauschbetragBadge', 'Im Pauschbetrag (1.230 €)')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.draftProvenance}>
                      {isReceipt
                        ? tr('eule.workspace.provenanceReceiptOwl', '📎 Beleg + Eule')
                        : tr('eule.workspace.provenanceOwlDraft', '🦉 Eulen-Entwurf')}
                    </Text>
                    <Text style={styles.draftDiff}>
                      {`${draft.previousValue ?? tr('advisor.chat.notRecorded', 'Nicht erfasst')} → ${draft.newValue}`}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleInspectMask(draft.screen, draft.field)}
                      style={styles.inspectMaskLink}
                      testID={`draft-inspect-${draft.actionId}`}
                    >
                      <Text style={styles.inspectMaskLinkText}>
                        {tr('eule.workspace.inspectMask', 'Maske ansehen →')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
            <Button
              onPress={() => void handleBatchApply(false)}
              disabled={bridge?.batchApplying ?? false}
              testID="eule-batch-apply-btn"
            >
              {bridge?.batchApplying
                ? tr('eule.workspace.applying', 'Wird übernommen …')
                : pendingDrafts.length === 1
                  ? tr('eule.workspace.applyOne', '✓ Änderung übernehmen & ins Cockpit')
                  : tr('eule.workspace.applyAll', {
                      count: pendingDrafts.length,
                      defaultValue: `✓ ${pendingDrafts.length} Änderungen übernehmen & ins Cockpit`,
                    })}
            </Button>
          </Card>
        ) : null}

        {cards.length === 0 ? (
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
      </>
    )
  }

  // 1. Desktop (bp === 'l', >= 1280px): 62/38 split pane with collapsible right chat panel
  if (bp === 'l') {
    return (
      <View style={styles.desktopRoot} testID="eulen-modus-screen">
        <View style={styles.workspaceToolbar}>
          {onBack ? <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} /> : <View />}
          <Pressable
            accessibilityRole="button"
            onPress={() => setDesktopChatOpen((prev) => !prev)}
            style={styles.toolbarToggleBtn}
            testID="eule-desktop-chat-toggle"
          >
            <Text style={styles.toolbarToggleText}>
              {desktopChatOpen
                ? tr('eule.workspace.chatHide', 'Chat ausblenden')
                : tr('eule.workspace.chatShow', '💬 Chat einblenden')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.desktopSplit} testID="eule-desktop-split">
          <ScrollView
            style={desktopChatOpen ? styles.desktopWorkbenchSplit : styles.desktopWorkbenchFull}
            contentContainerStyle={styles.paneContent}
            testID="eule-desktop-workbench"
          >
            {renderHeroAndSettings()}
            {renderWorkbenchBody()}
          </ScrollView>

          {desktopChatOpen ? (
            <ScrollView
              style={styles.desktopChatPane}
              contentContainerStyle={styles.paneContent}
              testID="eule-desktop-chat-pane"
            >
              {renderChatPanel(false)}
            </ScrollView>
          ) : null}
        </View>
      </View>
    )
  }

  // 2. Tablet (bp === 'm', 768–1279px): full-width workbench + slide-over chat drawer
  if (bp === 'm') {
    return (
      <View style={styles.tabletRoot} testID="eulen-modus-screen">
        <ScrollView contentContainerStyle={styles.wideScreen} testID="eule-tablet-workspace">
          <View style={styles.workspaceToolbar}>
            {onBack ? <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} /> : <View />}
            <Pressable
              accessibilityRole="button"
              onPress={() => setTabletDrawerOpen(true)}
              style={styles.toolbarToggleBtn}
              testID="eule-tablet-chat-toggle"
            >
              <Text style={styles.toolbarToggleText}>{tr('eule.workspace.tabletChatOpen', '🦉 Chat')}</Text>
            </Pressable>
          </View>
          {renderHeroAndSettings()}
          {renderWorkbenchBody()}
        </ScrollView>

        {tabletDrawerOpen ? (
          <View style={styles.tabletDrawerOverlay} testID="eule-tablet-drawer">
            <View style={styles.drawerHeader}>
              <AiChip>{tr('eule.sender', 'Die Eule')}</AiChip>
              <Pressable
                accessibilityRole="button"
                onPress={() => setTabletDrawerOpen(false)}
                style={styles.toolbarToggleBtn}
                testID="eule-tablet-drawer-close"
              >
                <Text style={styles.toolbarToggleText}>{tr('eule.workspace.tabletChatClose', '✕ Schließen')}</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.paneContent}>
              {renderChatPanel(true)}
            </ScrollView>
          </View>
        ) : null}
      </View>
    )
  }

  // 3. Mobile (bp === 's', < 768px): workbench + sticky 20% dock (never auto-maximized)
  return (
    <View style={styles.mobileRoot} testID="eulen-modus-screen">
      {mobileSheetOpen ? (
        <View style={styles.mobileSheet} testID="eule-mobile-sheet">
          <View style={styles.drawerHeader}>
            <AiChip>{tr('eule.sender', 'Die Eule')}</AiChip>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMobileSheetOpen(false)}
              style={styles.toolbarToggleBtn}
              testID="eule-mobile-minimize-btn"
            >
              <Text style={styles.toolbarToggleText}>{tr('eule.workspace.minimize', '▾ Verkleinern')}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.paneContent}>
            {renderChatPanel(true)}
          </ScrollView>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.screen}>
            {onBack ? (
              <View style={styles.headerRow}>
                <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} />
              </View>
            ) : null}

            {renderHeroAndSettings()}

            <View style={styles.tabBar} accessibilityRole="tablist" role="tablist">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'fragen' }}
                onPress={() => setTab('fragen')}
                style={[styles.tabButton, tab === 'fragen' && styles.tabButtonActive]}
                testID="eule-tab-fragen"
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
                testID="eule-tab-eule"
              >
                <Text style={[styles.tabText, tab === 'eule' && styles.tabTextActive]}>
                  {tr('eule.tabEule', 'Eule fragt dich')} · {cards.length}
                </Text>
              </Pressable>
            </View>

            {tab === 'fragen' ? renderChatPanel(true) : renderWorkbenchBody()}
          </ScrollView>

          {tab === 'eule' ? (
            <View style={styles.mobileDock} testID="eule-mobile-dock">
              <View style={styles.dockHeader}>
                <Text style={styles.dockTitle}>🦉 {tr('eule.sender', 'Die Eule')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMobileSheetOpen(true)}
                  style={styles.dockMaximizeBtn}
                  testID="eule-mobile-maximize-btn"
                >
                  <Text style={styles.dockMaximizeText}>{tr('eule.workspace.maximize', '⤢ Maximieren')}</Text>
                </Pressable>
              </View>
              <View style={styles.dockInputRow}>
                {handleAttachReceipt ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr('advisor.chat.attachReceiptAria', 'Beleg anhängen')}
                    onPress={() => setMobileSheetOpen(true)}
                    style={styles.dockReceiptBtn}
                    testID="eule-mobile-dock-receipt-btn"
                  >
                    <Text style={styles.dockReceiptText}>📎</Text>
                  </Pressable>
                ) : null}
                <TextInput
                  accessibilityLabel={tr('eule.workspace.dockPlaceholder', 'Kurze Frage an die Eule …')}
                  value={dockInput}
                  onChangeText={setDockInput}
                  placeholder={tr('eule.workspace.dockPlaceholder', 'Kurze Frage an die Eule …')}
                  placeholderTextColor={t.color.tinte2}
                  style={styles.dockInput}
                  testID="eule-mobile-dock-input"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={effectiveSending || dockInput.trim().length === 0}
                  onPress={() => {
                    const q = dockInput.trim()
                    if (!q || effectiveSending) return
                    setDockInput('')
                    setMobileSheetOpen(true)
                    void handleSendChat(q)
                  }}
                  style={styles.dockSendBtn}
                  testID="eule-mobile-dock-send-btn"
                >
                  <Text style={styles.dockSendText}>{tr('advisor.chat.sendButton', 'Fragen')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const kiColor = t.color.ki
  const kiBg = t.color.kiWeich

  return {
    desktopRoot: {
      flex: 1,
      backgroundColor: t.color.grund,
      maxWidth: WIDE_CONTENT_MAX_WIDTH,
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: t.space.s5,
      paddingTop: t.space.s4,
    } as ViewStyle,
    desktopSplit: {
      flex: 1,
      flexDirection: 'row',
      gap: t.space.s5,
      alignItems: 'stretch',
    } as ViewStyle,
    desktopWorkbenchSplit: {
      flex: 62,
    } as ViewStyle,
    desktopWorkbenchFull: {
      flex: 1,
    } as ViewStyle,
    desktopChatPane: {
      flex: 38,
      backgroundColor: t.color.karte,
      borderRadius: t.radius.m,
      borderWidth: 1.5,
      borderColor: t.color.kiLinie,
      paddingHorizontal: t.space.s4,
      marginBottom: t.space.s4,
    } as ViewStyle,
    tabletRoot: {
      flex: 1,
      backgroundColor: t.color.grund,
      position: 'relative',
    } as ViewStyle,
    tabletDrawerOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '55%',
      maxWidth: 460,
      backgroundColor: t.color.karte,
      borderLeftWidth: 2,
      borderColor: t.color.ki,
      padding: t.space.s4,
      ...t.shadow.hartL,
    } as ViewStyle,
    mobileRoot: {
      flex: 1,
      backgroundColor: t.color.grund,
    } as ViewStyle,
    mobileSheet: {
      flex: 1,
      marginTop: t.space.s4,
      backgroundColor: t.color.karte,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      borderWidth: 2,
      borderColor: t.color.ki,
      padding: t.space.s4,
    } as ViewStyle,
    mobileDock: {
      backgroundColor: t.color.karte,
      borderTopWidth: 2,
      borderColor: t.color.ki,
      paddingHorizontal: t.space.s4,
      paddingVertical: t.space.s3,
      gap: t.space.s2,
    } as ViewStyle,
    dockHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    } as ViewStyle,
    dockTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    dockMaximizeBtn: {
      paddingVertical: 4,
      paddingHorizontal: t.space.s2,
      borderRadius: t.radius.s,
      backgroundColor: t.color.kiWeich,
    } as ViewStyle,
    dockMaximizeText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.ki,
    } as TextStyle,
    dockInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s2,
    } as ViewStyle,
    dockReceiptBtn: {
      paddingHorizontal: t.space.s2,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.s,
      borderWidth: 1,
      borderColor: t.color.linieWeich,
      backgroundColor: t.color.grund,
    } as ViewStyle,
    dockReceiptText: {
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    dockInput: {
      flex: 1,
      backgroundColor: t.color.grund,
      borderWidth: 1,
      borderColor: t.color.linieWeich,
      borderRadius: t.radius.s,
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    dockSendBtn: {
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.funke,
      borderWidth: 1.5,
      borderColor: t.color.tinte,
    } as ViewStyle,
    dockSendText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.schwer,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    drawerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.space.s3,
    } as ViewStyle,
    workspaceToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.space.s3,
    } as ViewStyle,
    toolbarToggleBtn: {
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.karte,
      borderWidth: 1.5,
      borderColor: t.color.ki,
    } as ViewStyle,
    toolbarToggleText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.ki,
    } as TextStyle,
    paneContent: {
      paddingVertical: t.space.s3,
    } as ViewStyle,
    guestCard: {
      marginTop: t.space.s3,
      gap: t.space.s3,
    } as ViewStyle,
    guestTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.xl,
      color: t.color.tinte,
    } as TextStyle,
    guestBody: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      lineHeight: 22,
    } as TextStyle,
    guestActions: {
      gap: t.space.s2,
      marginTop: t.space.s2,
    } as ViewStyle,
    inlineMaskWrap: {
      gap: t.space.s3,
      marginBottom: t.space.s4,
    } as ViewStyle,
    backToStageBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.s,
      backgroundColor: t.color.karte,
      borderWidth: 1,
      borderColor: t.color.linieWeich,
    } as ViewStyle,
    backToStageText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    inlineMaskFocusBanner: {
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.s,
      backgroundColor: t.color.kiWeich,
      borderWidth: 1,
      borderColor: t.color.kiLinie,
    } as ViewStyle,
    inlineMaskFocusText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.kiTinte,
    } as TextStyle,
    manualNoticeCard: {
      borderColor: t.color.warn,
      backgroundColor: t.color.warnWeich,
    } as ViewStyle,
    manualNoticeText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    receiptResultCard: {
      marginBottom: t.space.s4,
      gap: t.space.s2,
    } as ViewStyle,
    conflictCard: {
      borderColor: t.color.warn,
      backgroundColor: t.color.warnWeich,
      marginBottom: t.space.s4,
      gap: t.space.s2,
    } as ViewStyle,
    conflictTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    conflictText: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    conflictActions: {
      flexDirection: 'row',
      gap: t.space.s2,
      marginTop: t.space.s2,
    } as ViewStyle,
    draftStageCard: {
      marginBottom: t.space.s4,
      gap: t.space.s3,
    } as ViewStyle,
    draftSectionTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.l,
      color: t.color.tinte,
    } as TextStyle,
    draftList: {
      gap: t.space.s2,
    } as ViewStyle,
    draftRowCard: {
      backgroundColor: t.color.karte,
      borderRadius: t.radius.s,
      padding: t.space.s3,
      borderWidth: 1,
      borderColor: t.color.kiLinie,
      gap: 4,
    } as ViewStyle,
    draftTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.space.s2,
    } as ViewStyle,
    draftTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
      flexShrink: 1,
    } as TextStyle,
    draftDelta: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.s,
      color: t.color.ok,
    } as TextStyle,
    draftMutedBadge: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.tinte2,
    } as TextStyle,
    draftProvenance: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.kiTinte,
    } as TextStyle,
    draftDiff: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    inspectMaskLink: {
      alignSelf: 'flex-start',
      marginTop: 4,
      paddingVertical: 4,
    } as ViewStyle,
    inspectMaskLinkText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.ki,
    } as TextStyle,
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
      borderColor: t.color.kiLinie,
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
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginTop: 4,
    } as TextStyle,
    quelleRow: {
      borderTopWidth: 1,
      borderTopColor: t.color.linieWeich,
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
