import { useState } from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, Feld, useTheme } from '@steuereule/ui'
import type { ChSalaryCertificateResponseDto, NGreDetailsDto, PutNGreDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { AddressSearch } from '../shared/AddressSearch'
import { useKnownEmployers } from '../master-data/employersStore'
import { makeStyles } from './CrossBorderScreen.styles'
import { NGreInput } from './NGreInput'
import { DailyBenefitQuestion } from './DailyBenefitQuestion'
import { YesNo } from './YesNo'
import { wageFieldValue } from './salaryCertificateAmounts'
import { addressLines, postalCodeFrom } from './employerAddress'

const N_GRE_TEXT_FIELDS = ['arbeitgeberName', 'arbeitgeberStrasse', 'arbeitgeberPlzOrt'] as const
/** The amounts before and after the daily-benefit question, which sits right under the family allowance. */
const N_GRE_AMOUNTS_BEFORE_DAILY_BENEFIT = ['familienzulagenChf'] as const
const N_GRE_AMOUNTS_AFTER_DAILY_BENEFIT = ['krankentaggeldChf', 'pkArbeitnehmerChf', 'pkArbeitgeberGesamtChf', 'pkArbeitgeberChf'] as const

type NGreAmountField = (typeof N_GRE_AMOUNTS_BEFORE_DAILY_BENEFIT)[number] | (typeof N_GRE_AMOUNTS_AFTER_DAILY_BENEFIT)[number]

function NGreAmount({ field, nGre, onSet }: { readonly field: NGreAmountField; readonly nGre: NGreDetailsDto; readonly onSet: (data: PutNGreDto) => void }) {
  const { t: tr } = useTranslation(APP_NS)
  return (
    <NGreInput
      label={tr(`grenzgaenger.nGre.felder.${field}`)}
      initial={nGre[field] === null || nGre[field] === undefined ? '' : String(nGre[field])}
      numeric
      testID={`ch-ngre-${field}`}
      onCommit={(text) => onSet({ [field]: text === '' ? null : Number(text) })}
    />
  )
}

/** Who pays the premium (N-Gre Zeilen 18/19, 95–98); the CHF field only matters when the employer pays it all. */
const PREMIUMS = [
  { prozent: 'krankentaggeldArbeitgeberProzent', chf: 'krankentaggeldArbeitgeberChf' },
  { prozent: 'nbuvArbeitgeberProzent', chf: 'nbuvArbeitgeberChf' },
] as const

export function NGreSection({
  nGre,
  salaryCertificate,
  taxYear,
  onSet,
}: {
  readonly nGre: NGreDetailsDto
  readonly salaryCertificate: ChSalaryCertificateResponseDto
  readonly taxYear: number
  readonly onSet: (data: PutNGreDto) => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const employers = useKnownEmployers()
  const [employerText, setEmployerText] = useState<{
    readonly arbeitgeberName: string
    readonly arbeitgeberStrasse: string
    readonly arbeitgeberPlzOrt: string
  }>({
    arbeitgeberName: nGre.arbeitgeberName ?? '',
    arbeitgeberStrasse: nGre.arbeitgeberStrasse ?? '',
    arbeitgeberPlzOrt: nGre.arbeitgeberPlzOrt ?? '',
  })

  const currentPostalCode = postalCodeFrom(employerText.arbeitgeberPlzOrt)

  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.nGre.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.nGre.help')}</Text>

      {employers.length > 0 ? (
        <View style={styles.employerPickerBox} testID="ch-ngre-arbeitgeber-auswahl">
          <Text style={styles.employerPickerLabel}>Schon erfasste Arbeitgeber übernehmen:</Text>
          <View style={styles.employerChipsRow}>
            {employers.map((emp) => (
              <Chip
                key={emp.id}
                active={employerText.arbeitgeberName === emp.name}
                onPress={() => {
                  setEmployerText({
                    arbeitgeberName: emp.name,
                    arbeitgeberStrasse: emp.strasse,
                    arbeitgeberPlzOrt: emp.plzOrt,
                  })
                  onSet({
                    arbeitgeberName: emp.name,
                    arbeitgeberStrasse: emp.strasse,
                    arbeitgeberPlzOrt: emp.plzOrt,
                  })
                }}
                testID={`ch-ngre-arbeitgeber-chip-${emp.id}`}
              >
                {`${emp.name} (${emp.plzOrt})`}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}

      <AddressSearch
        postalCode={currentPostalCode}
        testIDPrefix="ch-ngre"
        onPick={(address) => {
          const { streetLine, cityLine } = addressLines(address)
          setEmployerText((prev) => ({
            ...prev,
            arbeitgeberStrasse: streetLine,
            arbeitgeberPlzOrt: cityLine,
          }))
          onSet({
            arbeitgeberStrasse: streetLine,
            arbeitgeberPlzOrt: cityLine,
          })
        }}
      />

      {N_GRE_TEXT_FIELDS.map((field) => (
        <NGreInput
          key={field}
          label={tr(`grenzgaenger.nGre.felder.${field}`)}
          initial={nGre[field] ?? ''}
          controlledValue={employerText[field]}
          onControlledChange={(val) => setEmployerText((prev) => ({ ...prev, [field]: val }))}
          testID={`ch-ngre-${field}`}
          onCommit={(text) => onSet({ [field]: text === '' ? null : text })}
        />
      ))}

      {N_GRE_AMOUNTS_BEFORE_DAILY_BENEFIT.map((field) => (
        <NGreAmount key={field} field={field} nGre={nGre} onSet={onSet} />
      ))}
      <DailyBenefitQuestion
        nGre={nGre}
        grossWageChf={wageFieldValue(salaryCertificate, 'bruttolohn-total')}
        ahvContributionsChf={wageFieldValue(salaryCertificate, 'ahv-beitraege')}
        taxYear={taxYear}
        onSet={onSet}
      />
      {N_GRE_AMOUNTS_AFTER_DAILY_BENEFIT.map((field) => (
        <NGreAmount key={field} field={field} nGre={nGre} onSet={onSet} />
      ))}
      <YesNo
        label={tr('grenzgaenger.nGre.felder.familienzulagenImBruttolohn')}
        help={tr('grenzgaenger.nGre.felder.familienzulagenImBruttolohnHilfe')}
        value={nGre.familienzulagenImBruttolohn}
        onChange={(v) => onSet({ familienzulagenImBruttolohn: v })}
        testID="ch-ngre-familienzulagen-im-brutto"
      />
      <YesNo
        label={tr('grenzgaenger.nGre.felder.kvZuschussAnspruch')}
        value={nGre.kvZuschussAnspruch}
        onChange={(v) => onSet({ kvZuschussAnspruch: v })}
        testID="ch-ngre-kv-zuschuss"
      />
      {PREMIUMS.map(({ prozent: percent, chf }) => (
        <View key={percent}>
          <NGreInput
            label={tr(`grenzgaenger.nGre.felder.${percent}`)}
            initial={nGre[percent] === null ? '' : String(nGre[percent])}
            numeric
            testID={`ch-ngre-${percent}`}
            onCommit={(text) => {
              if (text === '') onSet({ [percent]: null })
              else if (/^(0|[1-9]\d?|100)$/.test(text)) onSet({ [percent]: Number(text) })
            }}
          />
          {nGre[percent] === null || nGre[percent] === 100 ? (
            <NGreInput
              label={tr(`grenzgaenger.nGre.felder.${chf}`)}
              initial={nGre[chf] === null ? '' : String(nGre[chf])}
              numeric
              testID={`ch-ngre-${chf}`}
              onCommit={(text) => {
                if (text === '') onSet({ [chf]: null })
                else onSet({ [chf]: Number(text) })
              }}
            />
          ) : null}
        </View>
      ))}
      <Feld label={tr('grenzgaenger.nGre.sonderfaelle')}>
        <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
          <Chip active={nGre.specialCases === false} onPress={() => onSet({ specialCases: false })} testID="ch-ngre-sonderfaelle-nein">
            {tr('grenzgaenger.nGre.nein')}
          </Chip>
          <Chip active={nGre.specialCases === true} onPress={() => onSet({ specialCases: true })} testID="ch-ngre-sonderfaelle-ja">
            {tr('grenzgaenger.nGre.ja')}
          </Chip>
        </View>
      </Feld>
    </>
  )
}
