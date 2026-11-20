import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feld, Input, useTheme } from '@steuereule/ui'
import type { CsvColumnDto, CsvMappingDto } from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'

export interface MappingState {
  readonly delimiter: CsvMappingDto['delimiter']
  readonly decimal: CsvMappingDto['decimal']
  readonly dateFormat: CsvMappingDto['dateFormat']
  readonly bookingDate: string
  /** One signed column, or separate debit and credit columns. */
  readonly split: boolean
  readonly amount: string
  readonly debit: string
  readonly credit: string
  readonly counterparty: string
  readonly iban: string
  /** Column names, comma separated: the reference is read from all of them. */
  readonly reference: string
}

const DELIMITER_ID = { ';': 'semikolon', ',': 'komma', '\t': 'tab' } as const
const DECIMAL_ID = { ',': 'komma', '.': 'punkt' } as const

export const EMPTY_MAPPING: MappingState = { delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YYYY', bookingDate: '', split: false, amount: '', debit: '', credit: '', counterparty: '', iban: '', reference: '' }

/** A column is named, or (when the entry is a whole number) counted from 0; blank is no column. */
function column(raw: string): CsvColumnDto | null {
  const text = raw.trim()
  if (text === '') return null
  return /^\d+$/.test(text) ? { index: Number(text) } : { name: text }
}

/** The mapping the API takes; null while a required column (booking date, amount or debit+credit, a reference) is missing. */
export function buildMapping(state: MappingState): CsvMappingDto | null {
  const date = column(state.bookingDate)
  const references = state.reference.split(',').map(column).filter((c): c is CsvColumnDto => c !== null)
  const amount = column(state.amount)
  const debit = column(state.debit)
  const credit = column(state.credit)
  if (date === null || references.length === 0) return null
  if (state.split ? debit === null || credit === null : amount === null) return null
  const counterparty = column(state.counterparty)
  const iban = column(state.iban)
  return {
    delimiter: state.delimiter,
    decimal: state.decimal,
    dateFormat: state.dateFormat,
    bookingDate: date,
    reference: references,
    ...(state.split ? { debit: debit!, credit: credit! } : { amount: amount! }),
    ...(counterparty !== null ? { counterpartyName: counterparty } : {}),
    ...(iban !== null ? { counterpartyIban: iban } : {}),
  }
}

/** The column mapping of a bank file the presets do not know. */
export function MappingForm({ state, onChange }: { readonly state: MappingState; readonly onChange: (next: MappingState) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const set = (patch: Partial<MappingState>) => onChange({ ...state, ...patch })
  const input = (key: 'bookingDate' | 'amount' | 'debit' | 'credit' | 'counterparty' | 'iban' | 'reference', label: string) => (
    <Feld label={label}>
      <Input value={state[key]} onChange={(v) => set({ [key]: v })} accessibilityLabel={label} testID={`bank-map-${key}`} />
    </Feld>
  )
  return (
    <View testID="bank-mapping">
      <Text style={{ ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s2 }}>{tr('business.bank.mapping.hinweis')}</Text>
      <Feld label={tr('business.bank.mapping.trenner')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          {([';', ',', '\t'] as const).map((d) => (
            <Choice key={d} selected={state.delimiter === d} onPress={() => set({ delimiter: d })} testID={`bank-map-trenner-${DELIMITER_ID[d]}`}>
              {d === '\t' ? 'Tab' : d}
            </Choice>
          ))}
        </View>
      </Feld>
      <Feld label={tr('business.bank.mapping.dezimal')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          {([',', '.'] as const).map((d) => (
            <Choice key={d} selected={state.decimal === d} onPress={() => set({ decimal: d })} testID={`bank-map-dezimal-${DECIMAL_ID[d]}`}>
              {d}
            </Choice>
          ))}
        </View>
      </Feld>
      <Feld label={tr('business.bank.mapping.datum')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          {(['DD.MM.YYYY', 'DD.MM.YY', 'YYYY-MM-DD'] as const).map((f) => (
            <Choice key={f} selected={state.dateFormat === f} onPress={() => set({ dateFormat: f })} testID={`bank-map-datum-${f}`}>
              {f}
            </Choice>
          ))}
        </View>
      </Feld>
      {input('bookingDate', tr('business.bank.mapping.buchungstag'))}
      <Feld label={tr('business.bank.mapping.betrag')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          <Choice selected={!state.split} onPress={() => set({ split: false })} testID="bank-map-betrag-eine">
            {tr('business.bank.mapping.eineSpalte')}
          </Choice>
          <Choice selected={state.split} onPress={() => set({ split: true })} testID="bank-map-betrag-zwei">
            {tr('business.bank.mapping.sollHaben')}
          </Choice>
        </View>
      </Feld>
      {state.split ? (
        <>
          {input('debit', tr('business.bank.mapping.soll'))}
          {input('credit', tr('business.bank.mapping.haben'))}
        </>
      ) : (
        input('amount', tr('business.bank.mapping.betragSpalte'))
      )}
      {input('counterparty', tr('business.bank.mapping.gegenpartei'))}
      {input('iban', tr('business.bank.mapping.iban'))}
      {input('reference', tr('business.bank.mapping.verwendungszweck'))}
    </View>
  )
}
