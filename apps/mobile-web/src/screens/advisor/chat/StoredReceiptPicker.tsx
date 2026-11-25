import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { type ReceiptResponseDto } from '@steuereule/api-client'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { storedReceiptFile } from '../../../lib/receipts/storedReceiptFile'
import { useReceiptInbox } from '../../../lib/receipts/useReceiptInbox'
import { useApiFailureMessage } from '../../../net/apiFailure'

export interface StoredReceiptPickerProps {
  /** Reads the stored original for the owl; resolves when it is done. */
  readonly onRead: (file: File, receiptId: string) => Promise<unknown>
  readonly disabled?: boolean | undefined
  /** Opens the Belege tab, where every document lies. */
  readonly onOpenReceipts?: (() => void) | undefined
}

const SHOWN = 8

/**
 * The way from the Belege inbox into the chat (UX review 2026-11): a document uploaded there is picked
 * here instead of being uploaded a second time. Its stored original is read on the device again — the
 * read text is never kept — and the drafts appear in the conversation as for a fresh upload.
 */
export function StoredReceiptPicker({ onRead, disabled = false, onOpenReceipts }: StoredReceiptPickerProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const query = useReceiptInbox({ enabled: open })
  const failureMessage = useApiFailureMessage()
  const stored = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((receipt) => receipt.hasFile)

  async function read(receipt: ReceiptResponseDto) {
    setBusyId(receipt.id)
    setFailedId(null)
    try {
      const file = await storedReceiptFile(receipt)
      if (file === null) {
        setFailedId(receipt.id)
        return
      }
      await onRead(file, receipt.id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View style={styles.block} testID="advisor-stored-receipts">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.toggle}
        testID="advisor-stored-receipts-toggle"
      >
        <Text style={styles.toggleText}>{`${tr('advisor.chat.storedReceipts.toggle')} ${open ? '▴' : '▾'}`}</Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {query.isPending ? <Text style={styles.hint}>{tr('belege.loading')}</Text> : null}
          {/* NR-07: a failed load is never "In deinen Belegen liegt noch keine Datei." */}
          {query.isError ? (
            <View style={styles.list} testID="advisor-stored-receipts-ladefehler">
              <Text style={styles.hint} accessibilityRole="alert">
                {failureMessage(query.error)}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.toggle} testID="advisor-stored-receipts-erneut">
                <Text style={styles.toggleText}>{tr('apiFehler.retry')}</Text>
              </Pressable>
            </View>
          ) : null}
          {query.isSuccess && stored.length === 0 ? <Text style={styles.hint}>{tr('advisor.chat.storedReceipts.empty')}</Text> : null}
          {stored.slice(0, SHOWN).map((receipt) => (
            <Pressable
              key={receipt.id}
              accessibilityRole="button"
              disabled={disabled || busyId !== null}
              onPress={() => void read(receipt)}
              style={styles.item}
              testID={`advisor-stored-receipt-${receipt.id}`}
            >
              <Text style={styles.itemText} numberOfLines={1}>
                {busyId === receipt.id ? tr('belege.eule.liest') : receipt.fileName}
              </Text>
            </Pressable>
          ))}
          {query.hasNextPage ? (
            <Pressable accessibilityRole="button" disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} style={styles.toggle} testID="advisor-stored-receipts-more">
              <Text style={styles.toggleText}>{tr(query.isFetchingNextPage ? 'belege.mehrLaden.laedt' : 'belege.mehrLaden.cta')}</Text>
            </Pressable>
          ) : null}
          {failedId !== null ? (
            <Text style={styles.hint} accessibilityLiveRegion="polite" testID="advisor-stored-receipt-failed">
              {tr('belege.eule.ergebnis.unreadable')}
            </Text>
          ) : null}
          {onOpenReceipts ? (
            <Pressable accessibilityRole="button" onPress={onOpenReceipts} style={styles.toggle} testID="advisor-stored-receipts-all">
              <Text style={styles.toggleText}>{tr('advisor.chat.storedReceipts.all')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const block: ViewStyle = { gap: t.space.s2 }
  const toggle: ViewStyle = { alignSelf: 'flex-start', paddingVertical: t.space.s1 }
  const toggleText: TextStyle = { ...t.type.label, color: t.color.tinte }
  const list: ViewStyle = { gap: t.space.s2 }
  const hint: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const item: ViewStyle = {
    paddingVertical: t.space.s2,
    paddingHorizontal: t.space.s3,
    borderRadius: t.radius.s,
    borderWidth: 1,
    borderColor: t.color.tinte2,
    backgroundColor: t.color.karte,
  }
  const itemText: TextStyle = { ...t.type.small, color: t.color.tinte }
  return { block, toggle, toggleText, list, hint, item, itemText }
}
