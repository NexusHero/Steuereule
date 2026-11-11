import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { OwlMark } from '../../marks/OwlMark'
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
  /** Legal status the owl's sources were checked against, as the core states it (DD.MM.YYYY). */
  readonly legalStatusDate: string
  /** Phone width: icons only, no legal status line. */
  readonly compact?: boolean | undefined
}

/** The core keeps the legal status as DD.MM.YYYY; English readers get it unambiguous. */
function formatDate(germanDate: string, language: string): string {
  if (language.startsWith('de')) return germanDate
  const [day, month, year] = germanDate.split('.')
  return day && month && year ? `${year}-${month}-${day}` : germanDate
}

/**
 * The one slim line above the chat (#476 decision 3). Everything that used to sit beside the
 * conversation lives here as a way in: privacy, the owl's hints and drafts, its settings, and the
 * legal status of its sources.
 */
export function OwlTopBar({
  onBack,
  hintCount,
  draftCount,
  panelOpen,
  onTogglePanel,
  onOpenPrivacy,
  onOpenSettings,
  legalStatusDate,
  compact = false,
}: OwlTopBarProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const hints = hintCount > 0 ? tr('eule.workspace.topbar.hints', { count: hintCount }) : null
  const drafts = draftCount > 0 ? tr('eule.workspace.topbar.drafts', { count: draftCount }) : null
  const pillLabel = [hints, drafts].filter((part): part is string => part !== null).join(' · ') || tr('eule.workspace.topbar.hintsNone')
  const needsAttention = hintCount + draftCount > 0

  return (
    <View style={styles.bar} testID="eule-topbar">
      <View style={styles.side}>
        {onBack ? <BackButton accessibilityLabel={tr('eule.back', 'Zurück')} onPress={onBack} /> : null}
        <OwlMark variant="tinte" size={28} />
        <Text style={styles.title} role="heading" aria-level={1} testID="eule-topbar-title">
          {tr('eule.workspace.topbar.title')}
        </Text>
      </View>

      <View style={styles.side}>
        {compact ? null : (
          <Text style={styles.legal} testID="eule-legal-status">
            {tr('eule.workspace.topbar.legalStatus', { date: formatDate(legalStatusDate, i18n.language) })}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('eule.workspace.topbar.privacyAria')}
          onPress={onOpenPrivacy}
          style={styles.chip}
          testID="eule-privacy-badge"
        >
          <Text style={styles.chipText}>{compact ? '🔒' : `🔒 ${tr('eule.workspace.topbar.privacy')}`}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tr('eule.workspace.topbar.hintsAria')}: ${pillLabel}`}
          aria-expanded={panelOpen}
          onPress={onTogglePanel}
          style={[styles.chip, needsAttention && styles.chipAttention, panelOpen && styles.chipActive]}
          testID="eule-hints-pill"
        >
          <Text style={[styles.chipText, needsAttention && styles.chipAttentionText]}>{compact ? `💡 ${hintCount + draftCount}` : `💡 ${pillLabel}`}</Text>
        </Pressable>
        {onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('eule.workspace.topbar.settingsAria')}
            onPress={onOpenSettings}
            style={styles.chip}
            testID="eule-settings-btn"
          >
            <Text style={styles.chipText}>⚙︎</Text>
          </Pressable>
        ) : null}
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
      paddingHorizontal: t.space.s4,
      paddingVertical: t.space.s2,
      borderBottomWidth: 1,
      borderBottomColor: t.color.linieWeich,
      backgroundColor: t.color.grund,
    } as ViewStyle,
    side: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, flexShrink: 1 } as ViewStyle,
    title: { fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    legal: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginRight: t.space.s1 } as TextStyle,
    chip: {
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s1,
      borderRadius: t.radius.pille,
      borderWidth: 1,
      borderColor: t.color.linieWeich,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    chipAttention: { borderColor: t.color.ki, backgroundColor: t.color.kiWeich } as ViewStyle,
    chipActive: { borderWidth: 2, borderColor: t.color.ki } as ViewStyle,
    chipText: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.xs, color: t.color.tinte } as TextStyle,
    chipAttentionText: { color: t.color.kiTinte } as TextStyle,
  }
}
