import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, Feld, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CrossBorderScreen.styles'

export function YesNo({
  label,
  help,
  value,
  onChange,
  testID,
}: {
  readonly label: string
  readonly help?: string
  readonly value: boolean | null
  readonly onChange: (value: boolean) => void
  readonly testID: string
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <Feld label={label}>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
        <Chip active={value === true} onPress={() => onChange(true)} testID={`${testID}-ja`}>
          {tr('grenzgaenger.nGre.ja')}
        </Chip>
        <Chip active={value === false} onPress={() => onChange(false)} testID={`${testID}-nein`}>
          {tr('grenzgaenger.nGre.nein')}
        </Chip>
      </View>
    </Feld>
  )
}
