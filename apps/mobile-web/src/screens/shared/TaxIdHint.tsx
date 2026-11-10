import { Text, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { checkTaxId } from '@steuereule/core'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

/** Checks a Steuer-ID while typing (#452 decision 11, AC 9); a hint, never a block. */
export function TaxIdHint({ value, testID }: { readonly value: string; readonly testID: string }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  if (checkTaxId(value) !== 'invalid') return null
  const style: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.fehler, marginTop: t.space.s1 }
  return (
    <Text style={style} accessibilityLiveRegion="polite" testID={testID}>
      {tr('steuerIdHinweis.ungueltig')}
    </Text>
  )
}
