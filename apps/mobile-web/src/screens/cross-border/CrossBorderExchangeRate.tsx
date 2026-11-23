import { useState } from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Input, Feld, useTheme } from '@steuereule/ui'
import { ANNUAL_AVERAGE_RATES } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CrossBorderScreen.styles'
import { MONTH_NUMBERS, eurPerHundredChf, exchangeRateToSave, monthLabel, rateText } from './exchangeRate'
import type { SetExchangeRateVars } from './useCrossBorder'

/** Month (or annual average) and rate of the CHF conversion; month and rate are held by the mask. */
export function CrossBorderExchangeRate({
  taxYear,
  month,
  onMonthChange,
  rate,
  onRateChange,
  onSetExchangeRate,
}: {
  readonly taxYear: number
  readonly month: string
  readonly onMonthChange: (month: string) => void
  readonly rate: string
  readonly onRateChange: (rate: string) => void
  readonly onSetExchangeRate: (vars: SetExchangeRateVars) => void
}) {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [rateError, setRateError] = useState(false)
  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.wechselkurs.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.wechselkurs.help')}</Text>
      <Feld label={tr('grenzgaenger.lohnausweis.wechselkurs.monat')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }} testID="ch-wechselkurs-monat">
          <Chip
            active={month === String(taxYear)}
            onPress={() => {
              onMonthChange(String(taxYear))
              const known = ANNUAL_AVERAGE_RATES[taxYear]
              if (known !== undefined) onRateChange(rateText(known))
            }}
            testID="ch-wechselkurs-jahresdurchschnitt"
          >
            {tr('grenzgaenger.lohnausweis.wechselkurs.jahresdurchschnitt')}
          </Chip>
          {MONTH_NUMBERS.map((number) => {
            const value = `${taxYear}-${number}`
            return (
              <Chip key={number} active={month === value} onPress={() => onMonthChange(value)} testID={`ch-wechselkurs-monat-${number}`}>
                {monthLabel(taxYear, number, i18n.language)}
              </Chip>
            )
          })}
        </View>
      </Feld>
      <Feld label={tr('grenzgaenger.lohnausweis.wechselkurs.kurs')}>
        <Input type="numeric" value={rate} onChange={onRateChange} placeholder="1,07" accessibilityLabel={tr('grenzgaenger.lohnausweis.wechselkurs.kurs')} testID="ch-wechselkurs-kurs" />
      </Feld>
      {month === String(taxYear) && ANNUAL_AVERAGE_RATES[taxYear] !== undefined ? (
        <Text style={styles.help}>
          {tr('grenzgaenger.lohnausweis.wechselkurs.jahresdurchschnittHinweis', {
            jahr: taxYear,
            eur: eurPerHundredChf(ANNUAL_AVERAGE_RATES[taxYear]!),
          })}
        </Text>
      ) : null}
      {rateError ? <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.wechselkurs.fehlt')}</Text> : null}
      <Button
        variant="ghost"
        testID="ch-wechselkurs-speichern"
        onPress={() => {
          const data = exchangeRateToSave(month, rate, taxYear)
          setRateError(data === null)
          if (data !== null) onSetExchangeRate({ jahr: taxYear, data })
        }}
      >
        {tr('grenzgaenger.lohnausweis.wechselkurs.speichern')}
      </Button>
    </>
  )
}
