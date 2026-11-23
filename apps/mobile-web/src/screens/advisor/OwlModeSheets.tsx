import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Sheet } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { ProjectNotes } from './chat/ProjectNotes'
import { Situation } from './chat/Situation'
import { ConversationSearch } from './chat/ConversationSearch'
import { OwlDrawer } from './chat/OwlDrawer'
import { ConnectionDetails } from './chat/ConnectionStatus'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { OwlModeScreenState } from './useOwlModeScreen'
import { OwlModeSettings } from './OwlModeSettings'
import { sessionSummaryText } from './OwlModeHelpers'

type OwlModeSheetsProps = Pick<
  OwlModeScreenProps,
  | 'connection'
  | 'onRecheckConnection'
  | 'onSearchConversations'
  | 'activeConversationId'
  | 'onSelectConversation'
  | 'situation'
  | 'onSaveSituation'
  | 'notes'
  | 'onAddNote'
  | 'onEditNote'
  | 'onDeleteNote'
  | 'profession'
  | 'onChooseProfession'
  | 'onToggleOptIn'
  | 'onClearConversation'
> & {
  readonly owl: OwlModeScreenState
  readonly taxYear: number
  readonly optInEnabled: boolean
  readonly workbench: ReactNode
  readonly projectPanel: (afterSwitch: () => void) => ReactNode
  readonly styles: ReturnType<typeof makeStyles>
}

/** The sheets and the drawer over the owl screen; each shows only while it is open. */
export function OwlModeSheets({
  owl,
  taxYear,
  optInEnabled,
  workbench,
  projectPanel,
  styles,
  connection,
  onRecheckConnection,
  onSearchConversations,
  activeConversationId,
  onSelectConversation,
  situation,
  onSaveSituation,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
  profession,
  onChooseProfession,
  onToggleOptIn,
  onClearConversation,
}: OwlModeSheetsProps) {
  const { t: tr } = useTranslation(APP_NS)
  const {
    bridge,
    wide,
    panelOpen,
    closePanel,
    connectionOpen,
    setConnectionOpen,
    rechecking,
    setRechecking,
    privacyOpen,
    setPrivacyOpen,
    conversationsOpen,
    setConversationsOpen,
    searchOpen,
    setSearchOpen,
    situationOpen,
    setSituationOpen,
    hasSituationDialog,
    settingsOpen,
    setSettingsOpen,
    setClearState,
    sessionSummaryOpen,
    setSessionSummaryOpen,
    appliedDrafts,
    pendingDrafts,
    cards,
  } = owl
  return (
    <>
      {panelOpen && !wide ? (
        <Sheet onClose={closePanel} closeLabel={tr('eule.workspace.topbar.panelClose')} testID="eule-workbench-sheet">
          {workbench}
        </Sheet>
      ) : null}

      {connectionOpen && connection ? (
        <Sheet onClose={() => setConnectionOpen(false)} closeLabel={tr('eule.workspace.topbar.privacyClose')} testID="eule-connection-sheet">
          <ConnectionDetails
            view={bridge?.reconnecting ? { kind: 'restoring' } : connection}
            rechecking={rechecking}
            onRecheck={() => {
              setRechecking(true)
              void Promise.resolve(onRecheckConnection?.()).finally(() => setRechecking(false))
            }}
          />
        </Sheet>
      ) : null}

      {privacyOpen ? (
        <Sheet onClose={() => setPrivacyOpen(false)} closeLabel={tr('eule.workspace.topbar.privacyClose')} testID="eule-privacy-sheet">
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle} role="heading" aria-level={2}>
              {tr('eule.workspace.topbar.privacyTitle')}
            </Text>
            <Text style={styles.help} testID="eule-privacy-text">
              {tr('eule.workspace.topbar.privacyBody')}
            </Text>
          </View>
        </Sheet>
      ) : null}

      {conversationsOpen && !wide ? (
        <OwlDrawer onClose={() => setConversationsOpen(false)} closeLabel={tr('eule.workspace.topbar.conversationsClose')} testID="eule-conversations-drawer">
          {projectPanel(() => setConversationsOpen(false))}
        </OwlDrawer>
      ) : null}

      {searchOpen && onSearchConversations ? (
        <Sheet onClose={() => setSearchOpen(false)} closeLabel={tr('eule.workspace.topbar.conversationsClose')} testID="eule-search-sheet">
          <ConversationSearch
            onSearch={onSearchConversations}
            canSwitch
            onOpen={(id) => {
              setSearchOpen(false)
              if (id !== activeConversationId) onSelectConversation?.(id)
            }}
          />
        </Sheet>
      ) : null}

      {situationOpen && hasSituationDialog ? (
        <Sheet onClose={() => setSituationOpen(false)} closeLabel={tr('advisor.chat.situation.dialogClose')} testID="eule-situation-sheet">
          <View style={styles.situationDialog}>
            <Text style={styles.sheetTitle} role="heading" aria-level={2}>
              {tr('advisor.chat.situation.dialogTitle')}
            </Text>
            {situation !== undefined && onSaveSituation ? <Situation text={situation} onSave={onSaveSituation} /> : null}
            {notes && onAddNote && onEditNote && onDeleteNote ? <ProjectNotes notes={notes} onAdd={onAddNote} onEdit={onEditNote} onDelete={onDeleteNote} /> : null}
          </View>
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <Sheet
          onClose={() => {
            setSettingsOpen(false)
            setClearState('closed')
          }}
          closeLabel={tr('eule.workspace.topbar.settingsClose')}
          testID="eule-settings-sheet"
        >
          <OwlModeSettings owl={owl} optInEnabled={optInEnabled} styles={styles} profession={profession} onChooseProfession={onChooseProfession} onToggleOptIn={onToggleOptIn} onClearConversation={onClearConversation} />
        </Sheet>
      ) : null}

      {sessionSummaryOpen ? (
        <Sheet
          onClose={() => setSessionSummaryOpen(false)}
          closeLabel={tr('eule.workspace.topbar.privacyClose')}
          testID="eule-session-summary-sheet"
        >
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle} role="heading" aria-level={2}>
              {`Eulen-Summary · Steuerjahr ${taxYear}`}
            </Text>
            <Text style={styles.help} testID="eule-session-summary-text">
              {sessionSummaryText(appliedDrafts, pendingDrafts, cards.length)}
            </Text>
          </View>
        </Sheet>
      ) : null}
    </>
  )
}
