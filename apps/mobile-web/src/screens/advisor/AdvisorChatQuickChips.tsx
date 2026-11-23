import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../i18n/resources'
import type { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatOpening, AdvisorQuickChip } from './AdvisorChat.types'
import type { AdvisorChatState } from './useAdvisorChat'
import { PAGE_QUICK_CHIPS, quickChipOf, shownQuickChips } from './AdvisorChatHelpers'

interface AdvisorChatQuickChipsProps {
  readonly chat: AdvisorChatState
  readonly quickChips: readonly (string | AdvisorQuickChip)[]
  readonly opening: AdvisorChatOpening | undefined
  readonly variant: 'panel' | 'page'
  readonly styles: ReturnType<typeof makeStyles>
}

/** The quick starts of an empty chat, led by the way into the interview or the link to the last opening. */
export function AdvisorChatQuickChips({ chat, quickChips, opening, variant, styles }: AdvisorChatQuickChipsProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { isEmpty, messages, chipsExpanded, setChipsExpanded, runCommand, handleSubmit } = chat
  if (!(quickChips.length > 0 && messages.length === 0)) return null

  // The page shows the first few quick starts; the rest wait behind "Mehr …" so the input stays the eye's target.
  const chipsShown = shownQuickChips(quickChips, variant, chipsExpanded)
  // Nothing entered yet: the way in is the interview. Nothing changed since the last opening: link to it.
  const openingChip =
    isEmpty && opening?.stage === 'empty' ? (
      <Pressable accessibilityRole="button" onPress={() => runCommand('/grill-me')} style={[styles.quickChipButton, styles.openingChip]} testID="advisor-opening-start">
        <Text style={styles.quickChipText}>{tr('advisor.chat.opening.start')}</Text>
      </Pressable>
    ) : isEmpty && opening?.lastOpeningAt && opening.onOpenLast ? (
      <Pressable accessibilityRole="button" onPress={opening.onOpenLast} style={[styles.quickChipButton, styles.openingChip]} testID="advisor-opening-last">
        <Text style={styles.quickChipText}>{tr('advisor.chat.opening.last', { date: new Date(opening.lastOpeningAt).toLocaleDateString('de-DE') })}</Text>
      </Pressable>
    ) : null

  return (
    <View style={[styles.quickChipsRow, variant === 'page' && styles.quickChipsRowCentered]} testID="advisor-quick-chips">
      {openingChip}
      {chipsShown.map((entry) => {
        const chip = quickChipOf(entry)
        return (
          <Pressable
            key={chip.label}
            accessibilityRole="button"
            onPress={() => void handleSubmit(chip.label, chip.quickAction)}
            style={styles.quickChipButton}
            testID={chip.testID}
          >
            <Text style={styles.quickChipText}>{chip.label}</Text>
          </Pressable>
        )
      })}
      {variant === 'page' && quickChips.length > PAGE_QUICK_CHIPS ? (
        <Pressable
          accessibilityRole="button"
          aria-expanded={chipsExpanded}
          onPress={() => setChipsExpanded((prev) => !prev)}
          style={styles.quickChipMore}
          testID="advisor-chips-more"
        >
          <Text style={styles.quickChipMoreText}>{tr(chipsExpanded ? 'advisor.chat.chipsLess' : 'advisor.chat.chipsMore')}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
