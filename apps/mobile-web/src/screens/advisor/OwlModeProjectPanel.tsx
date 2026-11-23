import { View } from 'react-native'
import { ConversationList } from './chat/ConversationList'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { OwlModeScreenState } from './useOwlModeScreen'

type OwlModeProjectPanelProps = Pick<
  OwlModeScreenProps,
  | 'conversations'
  | 'activeConversationId'
  | 'projects'
  | 'onSelectConversation'
  | 'onSelectConversationInYear'
  | 'onNewConversation'
  | 'onRenameConversation'
  | 'onDeleteConversation'
  | 'onSearchConversations'
> & {
  readonly owl: OwlModeScreenState
  readonly taxYear: number
  /** Runs after a switch, e.g. to close the drawer it sits in. */
  readonly afterSwitch: () => void
  readonly styles: ReturnType<typeof makeStyles>
}

/** The project of the tax year: its conversations and its notes. Sidebar on desktop, sheet elsewhere. */
export function OwlModeProjectPanel({
  owl,
  taxYear,
  afterSwitch,
  styles,
  conversations,
  activeConversationId,
  projects,
  onSelectConversation,
  onSelectConversationInYear,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onSearchConversations,
}: OwlModeProjectPanelProps) {
  const { bridge, setSearchOpen } = owl
  return (
    <View style={styles.projectPanel}>
      <ConversationList
        conversations={conversations ?? []}
        activeId={activeConversationId ?? null}
        canSwitch
        activeYear={taxYear}
        projects={projects}
        answeringIds={bridge?.answeringConversationIds}
        onSelectInYear={(year, id) => {
          onSelectConversationInYear?.(year, id)
          afterSwitch()
        }}
        onSelect={(id) => {
          onSelectConversation?.(id)
          afterSwitch()
        }}
        onNew={async () => {
          await onNewConversation?.()
          afterSwitch()
        }}
        onRename={async (id, title) => {
          await onRenameConversation?.(id, title)
        }}
        onDelete={async (id) => {
          await onDeleteConversation?.(id)
        }}
        onOpenSearch={
          onSearchConversations
            ? () => {
                afterSwitch()
                setSearchOpen(true)
              }
            : undefined
        }
      />
    </View>
  )
}
