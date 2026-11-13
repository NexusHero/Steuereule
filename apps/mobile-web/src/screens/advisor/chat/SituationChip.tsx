import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { StrokeIcon } from '../../../icons/StrokeIcon'

export interface SituationChipProps {
  /** The stored description of the household; empty while nothing was written. */
  readonly text: string
  readonly onPress: () => void
}

/** The first line of the description, for the chip; the chip itself cuts it to its width. */
export function situationSummary(text: string): string {
  return text.trim().split(/\n/)[0]?.trim() ?? ''
}

/**
 * What the owl knows about the household, as a chip in the composer (#476, chat-first): the user
 * sees what the answers rest on without a panel beside the chat. Empty, it invites to add it.
 */
export function SituationChip({ text, onPress }: SituationChipProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const summary = situationSummary(text)
  const filled = summary.length > 0
  const label = filled ? tr('advisor.chat.situation.chip', { summary }) : tr('advisor.chat.situation.chipEmpty')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('advisor.chat.situation.chipAria', { label })}
      onPress={onPress}
      style={(state) => [styles.chip, (state as { hovered?: boolean }).hovered ? styles.chipHover : null]}
      testID="eule-situation-chip"
    >
      {filled ? <View style={styles.dot} /> : <StrokeIcon name="plus" size={14} color={t.color.tinte2} strokeWidth={2.5} />}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {filled ? <StrokeIcon name="pencil" size={13} color={t.color.tinte2} /> : null}
    </Pressable>
  )
}

function makeStyles(t: UiTheme) {
  return {
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      // The slot decides the width: on a phone the chip shares the row with Skills and Turbo.
      maxWidth: '100%',
      minHeight: 36,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.pille,
      borderWidth: 1.5,
      borderColor: t.color.linieWeich,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    chipHover: { borderColor: t.color.linie } as ViewStyle,
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.color.ok } as ViewStyle,
    label: { flexShrink: 1, maxWidth: 280, fontFamily: t.font.text, fontWeight: t.weight.halb, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
  }
}
