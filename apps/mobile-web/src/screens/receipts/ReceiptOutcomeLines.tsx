import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { germanDayOf, otherYearOf, type ReceiptOutcome } from '../../lib/receipts/receiptOutcome'

/** The one sentence a Beleg says about itself (ADR-0097 §1), in plain words. */
export function useReceiptStatusText(): (outcome: ReceiptOutcome, options?: { readonly withReason?: boolean }) => string {
  const { t: tr } = useTranslation(APP_NS)
  return (o, options) => {
    switch (o.state) {
      case 'neu':
        return tr(o.reason === 'entwuerfe_fehlen' ? 'belege.stand.entwuerfeFehlen' : 'belege.stand.neu')
      case 'nicht_lesbar':
        // In a list of files the line is all there is: it says why, too.
        return options?.withReason === true && o.reason !== null
          ? tr('belege.stand.nichtLesbarGrund', { grund: tr(`belege.grund.${o.reason}`) })
          : tr('belege.stand.nichtLesbar')
      case 'vorschlaege':
        return tr('belege.stand.vorschlaege', { count: o.pending })
      case 'uebernommen':
        return tr('belege.stand.uebernommen', { count: o.applied })
      case 'verworfen':
        return tr('belege.stand.verworfen')
      case 'nichts_verwertbar':
        return o.reason === null || o.reason === 'nichts_erkannt'
          ? tr('belege.stand.nichtsErkannt')
          : tr('belege.stand.nichts', { grund: tr(`belege.grund.${o.reason}`) })
    }
  }
}

/** The sentence that explains a reason, for the states that have one. */
function reasonSentence(outcome: ReceiptOutcome): string | null {
  if (outcome.reason === null) return null
  if (outcome.state === 'nicht_lesbar' || outcome.state === 'nichts_verwertbar' || outcome.reason === 'entwuerfe_fehlen') {
    return `belege.grundSatz.${outcome.reason}`
  }
  return null
}

export interface ReceiptOutcomeLinesProps {
  readonly outcome: ReceiptOutcome
  /** The tax year open in the app: drafts in another one say so, with a switch. */
  readonly openYear: number
  readonly testIDPrefix: string
  /** Put the file name in front of the status („spende-2024.pdf: 1 Wert wartet auf dich“), for a list of several. */
  readonly fileName?: string | undefined
  /** „Für wen?“ is open: the Beleg waits for that answer, whatever its last state was. */
  readonly asking?: boolean | undefined
  /** Say why in a sentence (the Beleg card); a list of files keeps to the one line. */
  readonly explain?: boolean | undefined
  readonly onSwitchYear?: ((year: number) => void) | undefined
  readonly onOpenDrafts?: (() => void) | undefined
}

/**
 * What became of one Beleg, from the server's state (ADR-0097): the status line, why, the tax year its
 * drafts sit in when that is not the open one, a duplicate upload, and the way to its waiting drafts.
 */
export function ReceiptOutcomeLines({ outcome, openYear, testIDPrefix, fileName, asking = false, explain = true, onSwitchYear, onOpenDrafts }: ReceiptOutcomeLinesProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const statusText = useReceiptStatusText()
  const stand = asking ? tr('belege.stand.frage') : statusText(outcome, { withReason: !explain })
  const line = fileName !== undefined ? tr('belege.stand.datei', { datei: fileName, stand }) : stand
  const reasonKey = explain && !asking ? reasonSentence(outcome) : null
  const otherYear = asking ? null : otherYearOf(outcome, openYear)
  return (
    <View style={s.block}>
      <Text style={s.status} accessibilityLiveRegion="polite" testID={`${testIDPrefix}-stand`}>
        {line}
      </Text>
      {reasonKey !== null ? (
        <Text style={s.help} testID={`${testIDPrefix}-grund`}>
          {tr(reasonKey)}
        </Text>
      ) : null}
      {otherYear !== null ? (
        <View style={s.row}>
          <Text style={s.help} testID={`${testIDPrefix}-jahr`}>
            {tr('belege.stand.jahr', { jahr: otherYear })}
          </Text>
          {onSwitchYear ? (
            <Button variant="ghost" style={s.compact} onPress={() => onSwitchYear(otherYear)} testID={`${testIDPrefix}-jahr-wechseln`}>
              {tr('belege.stand.jahrWechseln', { jahr: otherYear })}
            </Button>
          ) : null}
        </View>
      ) : null}
      {outcome.duplicateOf !== null ? (
        <Text style={s.help} testID={`${testIDPrefix}-dublette`}>
          {tr('belege.stand.dublette', { datum: germanDayOf(outcome.duplicateOf.uploadedAt), datei: outcome.duplicateOf.fileName })}
        </Text>
      ) : null}
      {!asking && outcome.pending > 0 && onOpenDrafts ? (
        <View style={s.row}>
          <Button style={s.compact} onPress={onOpenDrafts} testID={`${testIDPrefix}-zu-vorschlaegen`}>
            {tr('belege.stand.zuVorschlaegen')}
          </Button>
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const block: ViewStyle = { gap: t.space.s1, marginTop: t.space.s2 }
  const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s2 }
  const status: TextStyle = { ...t.type.label, color: t.color.tinte }
  const help: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const compact: ViewStyle = { width: 'auto', minHeight: 40, paddingHorizontal: t.space.s4, alignSelf: 'flex-start' }
  return { block, row, status, help, compact }
}
