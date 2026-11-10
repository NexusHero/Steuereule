import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { churchTaxRateForState, lookupPostalCode } from '@steuereule/core'
import { Chip, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { stateForAddress } from './postalCodePrefill'

export interface PostalCodeHintProps {
  readonly plz: string
  readonly city: string
  /** The Ort the app filled from the postal code; the badge shows while the field still holds it. */
  readonly prefill: string | null
  readonly onChooseCity: (city: string) => void
  readonly testIDPrefix: string
  /** Also show the Bundesland and, for church members, the church tax rate that follows from it. */
  readonly showState?: boolean | undefined
  readonly churchMember?: boolean | undefined
}

/**
 * What the postal code tells about an address (#451 slice 3): "aus deiner PLZ" on a prefilled Ort,
 * a choice when the postal code has several places, an honest note for an unknown one. Runs on the
 * device only (decision 7).
 */
export function PostalCodeHint({ plz, city, prefill, onChooseCity, testIDPrefix, showState = false, churchMember = false }: PostalCodeHintProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const result = lookupPostalCode(plz)
  if (result.kind === 'invalid') return null
  if (result.kind === 'unknown') {
    return (
      <Text style={styles.hint} testID={`${testIDPrefix}-plz-unbekannt`}>
        {tr('plz.unknown')}
      </Text>
    )
  }

  const chosen = result.places.some((p) => p.city.toLocaleLowerCase('de') === city.trim().toLocaleLowerCase('de'))
  const state = stateForAddress(plz, city)
  const stateName = state ? tr(`arbeitstage.feiertage.regionen.${state}`) : null

  return (
    <View style={styles.box}>
      {result.places.length > 1 && !chosen ? (
        <View testID={`${testIDPrefix}-plz-auswahl`}>
          <Text style={styles.hint}>{tr('plz.choose')}</Text>
          <View style={styles.row}>
            {result.places.map((place, index) => (
              <Chip key={`${place.city}-${place.state}`} active={false} onPress={() => onChooseCity(place.city)} testID={`${testIDPrefix}-plz-ort-${index}`}>
                {place.city}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      {prefill !== null && city === prefill ? (
        <Text style={styles.badge} testID={`${testIDPrefix}-ort-aus-plz`}>
          {tr('plz.fromPostalCode')}
        </Text>
      ) : null}
      {showState && state && stateName ? (
        <Text style={styles.hint} testID={`${testIDPrefix}-bundesland`}>
          {tr('plz.state', { state: stateName })} · {tr('plz.fromPostalCode')}
        </Text>
      ) : null}
      {showState && churchMember && state && stateName ? (
        <Text style={styles.hint} testID={`${testIDPrefix}-kirchensteuersatz`}>
          {tr('plz.churchTax', { state: stateName, rate: Math.round(churchTaxRateForState(state) * 100) })}
        </Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: { gap: t.space.s1, marginTop: -t.space.s2, marginBottom: t.space.s3 } as ViewStyle,
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginTop: t.space.s1 } as ViewStyle,
    hint: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    badge: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.ki, fontWeight: t.weight.fett } as TextStyle,
  }
}
