import { Text, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { inspectTaxId } from '@steuereule/core'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

/**
 * Checks a Steuer-ID while typing (#452 decision 11, AC 9); a hint, never a block. Eleven digits that
 * cannot be a Steuer-ID read differently from an entry that is not eleven digits (#67): the first is a
 * mistyped digit, the second a different kind of mistake.
 */
export function TaxIdHint({ value, testID }: { readonly value: string; readonly testID: string }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const finding = inspectTaxId(value)
  if (finding === 'valid' || finding === 'incomplete') return null
  const style: TextStyle = { ...t.type.caption, color: t.color.fehler, marginTop: t.space.s1 }
  return (
    <Text style={style} accessibilityLiveRegion="polite" testID={testID}>
      {finding === 'failed-check' ? tr('steuerIdHinweis.ungueltig') : tr('steuerIdHinweis.form')}
    </Text>
  )
}
