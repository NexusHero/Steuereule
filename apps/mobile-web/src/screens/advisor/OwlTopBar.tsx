import { ConnectionChip, type ConnectionView } from './chat/ConnectionStatus'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { OwlMark } from '../../marks/OwlMark'
import { StrokeIcon, type StrokeIconName } from '../../icons/StrokeIcon'
import { BackButton } from '../shared/BackButton'

export interface OwlTopBarProps {
  readonly onBack?: (() => void) | undefined
  /** Open hints of the owl (its proactive cards). */
  readonly hintCount: number
  /** Proposals waiting to be applied. */
  readonly draftCount: number
  readonly panelOpen: boolean
  readonly onTogglePanel: () => void
  readonly onOpenPrivacy: () => void
  /** Without it there is nothing to configure here (e.g. the local preview). */
  readonly onOpenSettings?: (() => void) | undefined
  /** Shows or hides the conversations: the sidebar on a wide screen, the drawer elsewhere; absent where there is no list. */
  readonly onOpenConversations?: (() => void) | undefined
  /** Whether the list it opens is showing right now (sidebar or drawer). */
  readonly conversationsExpanded?: boolean | undefined
  /** The status of the connection (#488): a dot and a word, tapped for details. */
  readonly connection?: ConnectionView | undefined
  readonly onOpenConnection?: (() => void) | undefined
  /** Phone width: the connection shows as a dot only. */
  readonly compact?: boolean | undefined
}

/**
 * The one slim line above the chat (#476, chat-first). Left the way to the conversations and the
 * name; right the connection and three quiet icons: privacy, the owl's hints and drafts (with a
 * count when something waits) and its settings. Nothing here may outshine the conversation.
 */
export function OwlTopBar({
  onBack,
  hintCount,
  draftCount,
  panelOpen,
  onTogglePanel,
  onOpenPrivacy,
  onOpenSettings,
  onOpenConversations,
  conversationsExpanded = false,
  connection,
  onOpenConnection,
  compact = false,
}: OwlTopBarProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const hints = hintCount > 0 ? tr('eule.workspace.topbar.hints', { count: hintCount }) : null
  const drafts = draftCount > 0 ? tr('eule.workspace.topbar.drafts', { count: draftCount }) : null
  const waiting = [hints, drafts].filter((part): part is string => part !== null).join(' · ') || tr('eule.workspace.topbar.hintsNone')
  const count = hintCount + draftCount

  const iconButton = (icon: StrokeIconName, label: string, onPress: () => void, testID: string, extra?: { readonly expanded?: boolean; readonly badge?: number }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-expanded={extra?.expanded}
      onPress={onPress}
      style={(state) => [styles.icon, (state as { hovered?: boolean }).hovered ? styles.iconHover : null, extra?.expanded ? styles.iconActive : null]}
      testID={testID}
    >
      <StrokeIcon name={icon} color={t.color.tinte} />
      {extra?.badge ? (
        <View style={styles.badge} testID={`${testID}-count`}>
          <Text style={styles.badgeText}>{extra.badge > 9 ? '9+' : String(extra.badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  )

  return (
    <View style={styles.bar} testID="eule-topbar">
      <View style={styles.brand}>
        {onBack ? <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} /> : null}
        {onOpenConversations
          ? iconButton('sidebar', tr('eule.workspace.topbar.conversationsAria'), onOpenConversations, 'eule-conversations-btn', { expanded: conversationsExpanded })
          : null}
        <OwlMark variant="tinte" size={26} />
        <Text style={styles.title} numberOfLines={1} role="heading" aria-level={1} testID="eule-topbar-title">
          {tr('eule.workspace.topbar.title')}
        </Text>
      </View>

      <View style={styles.side}>
        {connection && onOpenConnection ? <ConnectionChip view={connection} compact={compact} onPress={onOpenConnection} /> : null}
        {iconButton('lock', tr('eule.workspace.topbar.privacyAria'), onOpenPrivacy, 'eule-privacy-badge')}
        {iconButton('bulb', `${tr('eule.workspace.topbar.hintsAria')}: ${waiting}`, onTogglePanel, 'eule-hints-pill', { expanded: panelOpen, badge: count })}
        {onOpenSettings ? iconButton('settings', tr('eule.workspace.topbar.settingsAria'), onOpenSettings, 'eule-settings-btn') : null}
      </View>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.s3,
      minHeight: 56,
      paddingLeft: t.space.s2,
      paddingRight: t.space.s3,
      borderBottomWidth: 1,
      borderBottomColor: t.color.linieWeich,
      backgroundColor: t.color.grund,
    } as ViewStyle,
    side: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 } as ViewStyle,
    // The name of the screen never gives way: on a phone the controls on the right shrink instead.
    brand: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, flexShrink: 0 } as ViewStyle,
    title: { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    icon: { width: 44, height: 44, borderRadius: t.radius.s, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
    iconHover: { backgroundColor: t.color.linieWeich } as ViewStyle,
    iconActive: { backgroundColor: t.color.kiWeich } as ViewStyle,
    badge: {
      position: 'absolute',
      top: 6,
      right: 4,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.color.kiTinte,
    } as ViewStyle,
    badgeText: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: 11, color: t.color.grund } as TextStyle,
  }
}
