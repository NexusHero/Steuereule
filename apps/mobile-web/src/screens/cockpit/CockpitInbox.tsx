import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useReceiptControllerList } from '@steuereule/api-client'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

export interface CockpitInboxProps {
  readonly onOpenReceipts: () => void
}

/**
 * What waits in the Belege tab, said where the user starts (UX review 2026-11): documents without a tax
 * year count for nothing yet, and the cockpit did not mention them. Quiet when nothing waits.
 */
export function CockpitInbox({ onOpenReceipts }: CockpitInboxProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const query = useReceiptControllerList()
  const receipts = query.data?.status === 200 ? query.data.data : []
  const waiting = receipts.filter((receipt) => receipt.assignment.kind !== 'zugeordnet').length
  if (waiting === 0) return null
  return (
    <Pressable accessibilityRole="button" onPress={onOpenReceipts} style={styles.row} testID="cockpit-belege-eingang">
      <View style={styles.copy}>
        <Text style={styles.title}>{tr('cockpit.eingang.belege', { count: waiting })}</Text>
        <Text style={styles.hint}>{tr('cockpit.eingang.belegeHinweis')}</Text>
      </View>
      <Text style={styles.arrow} aria-hidden={true}>
        →
      </Text>
    </Pressable>
  )
}

function makeStyles(t: UiTheme) {
  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s3,
    width: '100%',
    marginTop: t.space.s3,
    paddingVertical: t.space.s3,
    paddingHorizontal: t.space.s4,
    borderRadius: t.radius.m,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte2,
    backgroundColor: t.color.karte,
  }
  const copy: ViewStyle = { flex: 1, minWidth: 0 }
  const title: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const hint: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const arrow: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  return { row, copy, title, hint, arrow }
}
