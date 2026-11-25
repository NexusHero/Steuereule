import { useEffect, useState } from 'react'
import { Pressable, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { formatEuro, formatEuroRange } from '@steuereule/core'
import { useTaxEstimateControllerGet, type TaxEstimateDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import type { MissingTarget } from './estimateMissing'
import { makeStyles } from './CockpitScreen.styles'
import { dismissEffect, observeMidpoint, type Effect } from './effectMemory'
import { effectText, estimateMissingItems, missingItemText, refundText } from './cockpitFormat'

interface RefundProps {
  readonly year: number
  readonly hideRange?: boolean
  readonly partnerName: string
  /** Opens the mask that holds a missing detail; without it the details are named but lead nowhere. */
  readonly onOpenMissing?: ((target: MissingTarget) => void) | undefined
}

export function Refund({ year, hideRange = false, partnerName, onOpenMissing }: RefundProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const query = useTaxEstimateControllerGet(year)
  const estimate: TaxEstimateDto | null = query.data?.data ?? null
  return (
    <>
      {/* C-05: a failed estimate says so, not „kommt später“. */}
      {hideRange ? null : query.isError ? (
        <Text style={styles.refundLater} accessibilityRole="alert" testID="cockpit-erstattung-fehler">
          {tr('cockpit.erstattung.ladefehler')}
        </Text>
      ) : (
        <Text style={styles.refundLater} testID="cockpit-erstattung">{refundText(estimate, tr, i18n.language)}</Text>
      )}
      {/* A count alone leaves the user searching (Echtdatenlauf 4): each missing detail is named, with its mask. */}
      {estimateMissingItems(estimate).map((item) => {
        const target = item.target
        const text = missingItemText(item, tr, partnerName)
        if (target === null || onOpenMissing === undefined) {
          return <Text key={item.raw} style={styles.refundLater} testID={`cockpit-fehlt-${item.raw}`}>{`• ${text}`}</Text>
        }
        return (
          <Pressable key={item.raw} accessibilityRole="button" accessibilityHint={tr('cockpit.erstattung.fehlt.oeffnen')} onPress={() => onOpenMissing(target)} style={styles.missingEstimateRow} testID={`cockpit-fehlt-${item.raw}`}>
            <Text style={styles.missingEstimateText}>{`${text} →`}</Text>
          </Pressable>
        )
      })}
      {estimate?.kind === 'spanne' && estimate.churchTaxOpen ? (
        <Text style={styles.refundLater} testID="cockpit-kirchensteuer-offen">
          {estimate.churchTax?.kind === 'offen' && estimate.churchTax.reason
            ? tr(`cockpit.erstattung.kirchensteuerOffen.${estimate.churchTax.reason}`)
            : tr('cockpit.erstattung.kirchensteuer')}
        </Text>
      ) : null}
      {estimate?.kind === 'spanne' && estimate.churchTax?.kind === 'spanne' && estimate.churchTax.capOnApplication ? (
        <Text style={styles.refundLater} testID="cockpit-kirchensteuer-kappung">{tr('cockpit.erstattung.kirchensteuerKappung')}</Text>
      ) : null}
    </>
  )
}

/**
 * The refund or back payment as the hero's headline (UX review H1), with the effect of the last change
 * underneath: what moved, in which area and form, and by how much.
 */
export function RefundHeadline({ year, estimate }: { readonly year: number; readonly estimate: TaxEstimateDto | null }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const result = estimate?.kind === 'spanne' ? (estimate.result ?? null) : null
  const midpoint = result === null ? null : Math.round((result.from + result.to) / 2)
  const [effect, setEffect] = useState<Effect | null>(null)
  useEffect(() => {
    setEffect(observeMidpoint(year, midpoint))
  }, [year, midpoint])
  if (result === null) return null
  // Exactly 0 € (e.g. a pension below the basic allowance) is neither a refund nor a back payment.
  const even = result.from === 0 && result.to === 0
  const label = even
    ? 'cockpit.hero.ergebnisLabel'
    : result.from >= 0
      ? 'cockpit.hero.erstattungLabel'
      : result.to <= 0
        ? 'cockpit.hero.nachzahlungLabel'
        : 'cockpit.hero.ergebnisLabel'
  const value =
    result.from === result.to
      ? formatEuro(Math.abs(result.from))
      : result.from >= 0 || result.to <= 0
        ? formatEuroRange(Math.min(Math.abs(result.from), Math.abs(result.to)), Math.max(Math.abs(result.from), Math.abs(result.to)))
        : tr('cockpit.hero.ergebnisSpanne', { nachzahlung: formatEuro(Math.abs(result.from)), erstattung: formatEuro(result.to) })
  return (
    // One element reads as the whole statement („Voraussichtliche Erstattung 483–544 €“) for screen readers and checks.
    <>
      <View testID="cockpit-erstattung">
        <Text style={styles.refundLabel}>{tr(label)}</Text>
        <Text style={styles.heroValue} testID="cockpit-erstattung-betrag">{value}</Text>
        {even ? <Text style={styles.effectLine} testID="cockpit-ausgeglichen">{tr('cockpit.hero.ausgeglichen')}</Text> : null}
      </View>
      {/* Outside the statement above: its euro amount is the change, not the estimate. */}
      {effect !== null && effect.deltaEur !== 0 ? (
        <Pressable accessibilityRole="button" accessibilityHint={tr('cockpit.wirkung.schliessen')} onPress={() => { dismissEffect(year); setEffect(null) }} testID="cockpit-wirkung">
          <Text style={styles.effectLine}>{effectText(effect, tr)}</Text>
        </Pressable>
      ) : null}
    </>
  )
}
