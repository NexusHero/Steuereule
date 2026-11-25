// A booking the owl or a receipt proposes (ADR-0101 §18): shown as a readable booking, applied or undone like any draft.
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@steuereule/ui'
import { findAccount, formatEuroCents, parseBookingDraft, toGermanDate, type AdvisorActionProposal, type ChartOfAccounts } from '@steuereule/core'
import { useBusinessControllerProfile } from '@steuereule/api-client'
import { APP_NS } from '../../../i18n/resources'
import type { makeStyles } from '../AdvisorChatPanel'
import { useOptionalCopilotBridge } from '../CopilotBridgeProvider'
import { advisorFailureText } from './advisorFailureText'

export function BookingDraftCard({
  action,
  onApply,
  onUndo,
  onDismiss,
  styles,
  testIDPrefix = 'buchung-entwurf',
}: {
  readonly action: AdvisorActionProposal
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onDismiss?: ((actionId: string) => Promise<void> | void) | undefined
  readonly styles: ReturnType<typeof makeStyles>
  readonly testIDPrefix?: string | undefined
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [busy, setBusy] = useState(false)
  const [thrown, setThrown] = useState<string | null>(null)
  // Why the API refused to post it (a locked period, a broken chain ...): on the card of that draft, in its German words.
  const bridge = useOptionalCopilotBridge()
  const refused = bridge?.applyFailure?.actionId === action.actionId ? bridge.applyFailure.message : thrown
  const parsed = parseBookingDraft(action.newValue)
  const year = parsed.ok ? Number(parsed.draft.date.slice(0, 4)) : 0
  // The chart decides what an account number means: the label comes from the book's own chart.
  const profile = useBusinessControllerProfile(year, undefined, { query: { enabled: parsed.ok, retry: false } })
  const chart: ChartOfAccounts | null = profile.data?.data.chart ?? null

  async function run(handler: ((actionId: string) => Promise<void> | void) | undefined) {
    if (!handler || busy) return
    setBusy(true)
    setThrown(null)
    try {
      await handler(action.actionId)
    } catch (error) {
      // NR-06: never the raw `error.message` ("Failed to fetch") — the API's own words or the shared wording.
      setThrown(advisorFailureText(error, tr, { server: tr('advisor.chat.applyFailed'), unknown: tr('advisor.chat.applyFailed') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.actionCard} testID="buchung-entwurf-karte">
      <View style={styles.actionHeader}>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </View>

      {parsed.ok ? (
        <View style={styles.diffBox}>
          <Text style={styles.diffValues} testID={`${testIDPrefix}-kopf`}>
            {`${toGermanDate(parsed.draft.date) ?? parsed.draft.date} · ${parsed.draft.text} · ${parsed.draft.documentNumber}`}
          </Text>
          {parsed.draft.lines.map((line, index) => {
            const label = chart === null ? null : findAccount(chart, line.account)?.label
            return (
              <Text key={`${line.account}-${index}`} style={styles.diffValues} testID={`${testIDPrefix}-zeile-${index}`}>
                {[
                  line.side === 'debit' ? tr('business.entwurf.soll') : tr('business.entwurf.haben'),
                  label ? `${line.account} ${label}` : line.account,
                  formatEuroCents(line.amount / 100),
                  line.taxKey && line.taxKey !== 'none' ? tr(`business.steuerschluessel.${line.taxKey}`) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )
          })}
        </View>
      ) : (
        // The draft cannot be shown as a booking (e.g. a regular payment without its year): the reason, plainly.
        <Text style={styles.actionReason} accessibilityRole="alert" testID={`${testIDPrefix}-ungueltig`}>
          {parsed.reason}
        </Text>
      )}

      <Text style={styles.actionReason}>{action.reason}</Text>
      {refused !== null && action.status !== 'applied' ? (
        <Text style={styles.actionReason} accessibilityRole="alert" testID={`${testIDPrefix}-fehler`}>
          {refused}
        </Text>
      ) : null}

      <View style={styles.actionFooter}>
        {action.status === 'dismissed' ? (
          <Text style={styles.mutedStatusBadge}>{tr('advisor.chat.dismissedBadge', 'Verworfen')}</Text>
        ) : action.status === 'superseded' ? (
          <Text style={styles.mutedStatusBadge}>{tr('advisor.chat.supersededBadge', 'Ersetzt durch neueren Entwurf')}</Text>
        ) : action.status === 'applied' ? (
          <View style={styles.appliedRow}>
            <Text style={styles.appliedBadge} testID={`${testIDPrefix}-gebucht`}>
              {tr('business.entwurf.gebucht')}
            </Text>
            {onUndo ? (
              <Pressable accessibilityRole="button" accessibilityLabel={tr('advisor.chat.undoAria', 'Rückgängig machen')} disabled={busy} onPress={() => void run(onUndo)} style={styles.undoButton} testID={`${testIDPrefix}-rueckgaengig`}>
                <Text style={styles.undoButtonText}>{tr('business.entwurf.stornieren')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Button disabled={busy || !parsed.ok} onPress={() => void run(onApply)} testID={`${testIDPrefix}-uebernehmen`}>
            {tr('business.entwurf.buchen')}
          </Button>
        )}
        {onDismiss && action.status === 'pending' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('advisor.chat.dismissAria', 'Entwurf verwerfen')} disabled={busy} onPress={() => void run(onDismiss)} style={styles.inspectMaskBtn} testID={`${testIDPrefix}-verwerfen`}>
            <Text style={styles.inspectMaskText}>{tr('advisor.chat.dismissButton', 'Verwerfen')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
