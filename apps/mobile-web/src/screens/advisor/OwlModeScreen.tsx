import { ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import type { AdvisorChatModelRefDto } from '@steuereule/api-client'
import type { AdvisorChatMessageView, OwlCardsDisplay, Profession, Screen } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { runningTaxYear } from '../../config/taxYear'
import { OwlTopBar } from './OwlTopBar'
import type { AdvisorChatDrafts, AdvisorChatModel, AdvisorChatOpening, AdvisorChatPanelProps, ChatSendOptions } from './AdvisorChatPanel'
import type { ConversationProject, ConversationSearchHit, ConversationSummary } from './chat/ConversationList'
import type { ProjectNote } from './chat/ProjectNotes'
import type { ConnectionView } from './chat/ConnectionStatus'
import { OWL_PANEL_WIDTHS, writeOwlPanelWidth, writeOwlSidebarOpen } from '../../lib/owlSidebarPreference'
import { ResizeHandle } from './chat/ResizeHandle'
import { useOptionalCopilotBridge } from './CopilotBridgeProvider'
import { GuestOwlGate } from './OwlGuestGate'
import { useOptionalSwitchToTab } from '../../navigation/ShellState'
import { makeStyles } from './OwlModeScreen.styles'
import { ConnectedOwlModeScreen } from './OwlModeScreen.connected'
import { useOwlModeScreen } from './useOwlModeScreen'
import { owlPanelWidths } from './OwlModeHelpers'
import { OwlModeChat } from './OwlModeChat'
import { OwlModeWorkbench } from './OwlModeWorkbench'
import { OwlModeProjectPanel } from './OwlModeProjectPanel'
import { OwlModeSheets } from './OwlModeSheets'
export { makeStyles } from './OwlModeScreen.styles'

/** The drafts the screen is given; what only the screen knows (the mask, the receipts) it adds itself. */
export type OwlModeScreenDrafts = Pick<
  AdvisorChatDrafts,
  'onApplyAction' | 'onUndoAction' | 'onDismissAction' | 'partnerName' | 'ownName' | 'jointReturn' | 'onRateMessage' | 'onUndoNoteChange'
>

/** The screen waits for the pick to be stored; the chat only needs to hand it on. */
export type OwlModeScreenModel = Omit<AdvisorChatModel, 'onPickModel'> & {
  readonly onPickModel?: ((model: AdvisorChatModelRefDto | null) => Promise<void>) | undefined
}

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
  /** Resolves `false` when the message did not reach the owl (WEB-14). */
  readonly onSendMessage?: ((text: string, options?: ChatSendOptions) => Promise<boolean | void> | boolean | void) | undefined
  /**
   * What the cards of an answer need from the caller: applying, undoing and refusing a draft
   * (ADR-0073 Nachtrag), whose they are, the rating and the notes. The screen adds what it knows itself.
   */
  readonly drafts?: OwlModeScreenDrafts | undefined
  /** Deletes this year's conversation on the server; rejects when it could not. */
  readonly onClearConversation?: (() => Promise<void>) | undefined
  /** The conversations of this tax year (#481); without them the screen shows no list. */
  readonly conversations?: readonly ConversationSummary[] | undefined
  readonly activeConversationId?: string | null | undefined
  readonly onSelectConversation?: ((id: string) => void) | undefined
  /** Every tax year with its conversations: the years are the projects of the sidebar (#503). */
  readonly projects?: readonly ConversationProject[] | undefined
  readonly onSelectConversationInYear?: ((taxYear: number, id: string) => void) | undefined
  readonly onNewConversation?: (() => Promise<void>) | undefined
  readonly onRenameConversation?: ((id: string, title: string) => Promise<void>) | undefined
  /** The chat models the user may pick (ADR-0096), the one picked and how to pick another; absent hides the picker and Max. */
  readonly model?: OwlModeScreenModel | undefined
  readonly onDeleteConversation?: ((id: string) => Promise<void>) | undefined
  readonly onSearchConversations?: ((query: string) => Promise<readonly ConversationSearchHit[]>) | undefined
  /** How full the context of the open conversation is (#481). */
  readonly context?: AdvisorChatPanelProps['context']
  readonly onSummarize?: (() => Promise<void>) | undefined
  /** The status of the connection to the model and the server (#488); without it the top bar shows none. */
  readonly connection?: ConnectionView | undefined
  readonly onRecheckConnection?: (() => Promise<unknown> | void) | undefined
  /** The project notes of this tax year (#481); without them the screen shows no notes. */
  readonly notes?: readonly ProjectNote[] | undefined
  readonly onAddNote?: ((text: string) => Promise<void>) | undefined
  readonly onEditNote?: ((id: string, text: string) => Promise<void>) | undefined
  readonly onDeleteNote?: ((id: string) => Promise<void>) | undefined
  /** The user's own description of the household's situation; the owl reads it in every conversation (#501). */
  readonly situation?: string | undefined
  readonly onSaveSituation?: ((text: string) => Promise<void>) | undefined
  /** How a new conversation starts: the way into the interview, or a link to the last opening (ADR-0067 §11). */
  readonly opening?: AdvisorChatOpening | undefined
  readonly isGuest?: boolean | undefined
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
}

export const AI_MANUAL_ONLY_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

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

export function OwlModeScreenView({
  onDone = () => {},
  onBack,
  taxYear = runningTaxYear(),
  initialCards = [],
  initialMessages,
  onDismissCard,
  onAcceptPath,
  optInEnabled = true,
  onToggleOptIn,
  profession,
  onChooseProfession,
  onSendMessage,
  drafts,
  onClearConversation,
  conversations,
  activeConversationId,
  onSelectConversation,
  projects,
  onSelectConversationInYear,
  onNewConversation,
  onRenameConversation,
  model,
  onDeleteConversation,
  onSearchConversations,
  context,
  onSummarize,
  connection,
  onRecheckConnection,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
  situation,
  onSaveSituation,
  opening,
}: OwlModeScreenProps & { readonly initialCards: readonly OwlCardsDisplay[] }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const switchToTab = useOptionalSwitchToTab()
  const owl = useOwlModeScreen({
    onDone,
    taxYear,
    initialCards,
    initialMessages,
    onDismissCard,
    onSendMessage,
    drafts,
    onClearConversation,
    onSearchConversations,
    situation,
    onSaveSituation,
    notes,
    onAddNote,
    onEditNote,
    onDeleteNote,
  })
  const {
    bp,
    bridge,
    wide,
    panelOpen,
    setPanelChoice,
    closePanel,
    setPrivacyOpen,
    setSettingsOpen,
    conversationsOpen,
    setConversationsOpen,
    setConnectionOpen,
    setSessionSummaryOpen,
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    workbenchWidth,
    setWorkbenchWidth,
    windowWidth,
    cards,
    pendingDrafts,
  } = owl

  const workbench = <OwlModeWorkbench owl={owl} taxYear={taxYear} onDone={onDone} onAcceptPath={onAcceptPath} styles={styles} />

  /** The project of the tax year: its conversations and its notes. Sidebar on desktop, sheet elsewhere. */
  const projectPanel = (afterSwitch: () => void) => (
    <OwlModeProjectPanel
      owl={owl}
      taxYear={taxYear}
      afterSwitch={afterSwitch}
      styles={styles}
      conversations={conversations}
      activeConversationId={activeConversationId}
      projects={projects}
      onSelectConversation={onSelectConversation}
      onSelectConversationInYear={onSelectConversationInYear}
      onNewConversation={onNewConversation}
      onRenameConversation={onRenameConversation}
      onDeleteConversation={onDeleteConversation}
      onSearchConversations={onSearchConversations}
    />
  )

  // One layout for every width (#476): the chat is the screen. The workbench is a side panel on a
  // wide screen and a sheet over the chat everywhere else, and only there when it is needed.
  // What the panels may take: the chat keeps its minimum, whatever was dragged or remembered.
  const showSidebar = Boolean(wide && sidebarOpen && conversations && onSelectConversation)
  const showWorkbench = panelOpen && wide
  const { sidebarMax, sidebarShown, workbenchMax, workbenchShown } = owlPanelWidths({ windowWidth, sidebarWidth, workbenchWidth, showSidebar, showWorkbench })

  return (
    <View style={styles.root} testID="eulen-modus-screen">
      <OwlTopBar
        onBack={onBack}
        hintCount={cards.length}
        draftCount={pendingDrafts.length}
        panelOpen={panelOpen}
        onTogglePanel={() => (panelOpen ? closePanel() : setPanelChoice('open'))}
        onOpenPrivacy={() => setPrivacyOpen(true)}
        onOpenSettings={onToggleOptIn || onChooseProfession || onClearConversation ? () => setSettingsOpen(true) : undefined}
        onOpenConversations={
          conversations && onSelectConversation
            ? () => {
                if (!wide) return setConversationsOpen(true)
                writeOwlSidebarOpen(!sidebarOpen)
                setSidebarOpen(!sidebarOpen)
              }
            : undefined
        }
        conversationsExpanded={wide ? sidebarOpen : conversationsOpen}
        connection={connection && bridge?.reconnecting ? { kind: 'restoring' } : connection}
        onOpenConnection={connection ? () => setConnectionOpen(true) : undefined}
        onOpenSessionSummary={() => setSessionSummaryOpen(true)}
        compact={bp === 's'}
      />

      <View style={styles.body}>
        {showSidebar ? (
          <>
            <ScrollView style={[styles.projectSidebar, { flexBasis: sidebarShown }]} contentContainerStyle={styles.projectSidebarContent} testID="eule-project-sidebar">
              {projectPanel(() => {})}
            </ScrollView>
            <ResizeHandle
              width={sidebarShown}
              min={OWL_PANEL_WIDTHS.sidebar.min}
              max={sidebarMax}
              panel="left"
              onResize={setSidebarWidth}
              onCommit={(next) => writeOwlPanelWidth('sidebar', next)}
              label={tr('eule.workspace.resizeSidebar')}
              testID="eule-resize-sidebar"
            />
          </>
        ) : null}

        <View style={styles.chatMain} testID="eule-chat-main">
          <OwlModeChat
            owl={owl}
            compact={bp === 's'}
            switchToTab={switchToTab}
            styles={styles}
            model={model}
            drafts={drafts}
            opening={opening}
            situation={situation}
            onSaveSituation={onSaveSituation}
            context={context}
            onSummarize={onSummarize}
          />
        </View>

        {showWorkbench ? (
          <>
            <ResizeHandle
              width={workbenchShown}
              min={OWL_PANEL_WIDTHS.workbench.min}
              max={workbenchMax}
              panel="right"
              onResize={setWorkbenchWidth}
              onCommit={(next) => writeOwlPanelWidth('workbench', next)}
              label={tr('eule.workspace.resizeWorkbench')}
              testID="eule-resize-workbench"
            />
            <ScrollView style={[styles.sidePanel, { flexBasis: workbenchShown }]} contentContainerStyle={styles.sidePanelContent} testID="eule-workbench-panel">
              {workbench}
            </ScrollView>
          </>
        ) : null}
      </View>

      <OwlModeSheets
        owl={owl}
        taxYear={taxYear}
        optInEnabled={optInEnabled}
        workbench={workbench}
        projectPanel={projectPanel}
        styles={styles}
        connection={connection}
        onRecheckConnection={onRecheckConnection}
        onSearchConversations={onSearchConversations}
        activeConversationId={activeConversationId}
        onSelectConversation={onSelectConversation}
        situation={situation}
        onSaveSituation={onSaveSituation}
        notes={notes}
        onAddNote={onAddNote}
        onEditNote={onEditNote}
        onDeleteNote={onDeleteNote}
        profession={profession}
        onChooseProfession={onChooseProfession}
        onToggleOptIn={onToggleOptIn}
        onClearConversation={onClearConversation}
      />
    </View>
  )
}
