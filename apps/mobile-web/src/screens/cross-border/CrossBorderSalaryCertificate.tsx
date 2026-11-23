import { useState } from 'react'
import { ScrollView, View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type Breakpoint } from '@steuereule/ui'
import { SALARY_CERTIFICATE_FIELDS } from '@steuereule/core'
import type { ChSalaryCertificateResponseDto, PutNGreDto, PutProvisionDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { makeStyles } from './CrossBorderScreen.styles'
import { GROSS_COMPONENT_IDS, grossComponentSum, isAdditionalGrossComponent, salaryAmountFrom, valueFromResponse } from './salaryCertificateAmounts'
import type { SetExchangeRateVars, SetFieldVars } from './useCrossBorder'
import { ChFieldInput } from './ChFieldInput'
import { CrossBorderReceiptUpload } from './CrossBorderReceiptUpload'
import { CrossBorderMissingFields, type RequiredField } from './CrossBorderMissingFields'
import { CrossBorderExchangeRate } from './CrossBorderExchangeRate'
import { ProvisionSection } from './CrossBorderProvisionSection'
import { NGreSection } from './CrossBorderNGreSection'
import { CrossBorderStatusCards } from './CrossBorderStatusCards'

export function SalaryCertificateStep({
  salaryCertificate,
  taxYear,
  onSetField,
  onSetExchangeRate,
  onSetNGre,
  onSetProvision,
  onDone,
  onBack,
  bp,
  partnerName,
}: {
  readonly salaryCertificate: ChSalaryCertificateResponseDto
  readonly taxYear: number
  readonly partnerName?: string
  readonly onSetField: (vars: SetFieldVars) => void
  readonly onSetExchangeRate: (vars: SetExchangeRateVars) => void
  readonly onSetNGre: (data: PutNGreDto) => void
  readonly onSetProvision: (data: PutProvisionDto) => void
  readonly onDone: () => void
  readonly onBack?: () => void
  readonly bp: Breakpoint
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [month, setMonth] = useState(salaryCertificate.exchangeRate?.month ?? '')
  const [rate, setRate] = useState(
    salaryCertificate.exchangeRate !== null && salaryCertificate.exchangeRate !== undefined ? String(salaryCertificate.exchangeRate.rate) : '',
  )

  const amountFields = SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag')
  const foldStatus = salaryCertificate.foldStatus
  const status = salaryCertificate.status

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of amountFields) {
      initial[field.id] = valueFromResponse(salaryCertificate, field.id)
    }
    return initial
  })
  const [manualGrossOverride, setManualGrossOverride] = useState(false)
  const [missingDrawerOpen, setMissingDrawerOpen] = useState(false)

  const calculatedGrossSum = grossComponentSum(drafts)
  const currentGrossInt = integerFrom(drafts['bruttolohn-total']?.trim() ?? '')

  // Required fields for the calculation fold: Ziffer 8, Ziffer 10, Ziffer 12 (when echter Grenzgänger), and Wechselkurs.
  const requiredFieldDefs: ReadonlyArray<RequiredField> = [
    {
      id: 'bruttolohn-total',
      label: `Ziff. 8 · ${tr('grenzgaenger.lohnausweis.felder.bruttolohn-total')}`,
      open: currentGrossInt === null && calculatedGrossSum === 0,
    },
    {
      id: 'berufliche-vorsorge',
      label: `Ziff. 10 · ${tr('grenzgaenger.lohnausweis.felder.berufliche-vorsorge')}`,
      open: integerFrom(drafts['berufliche-vorsorge']?.trim() ?? '') === null,
    },
    ...(status !== 'kein-grenzgaenger'
      ? [
          {
            id: 'quellensteuer',
            label: `Ziff. 12 · ${tr('grenzgaenger.lohnausweis.felder.quellensteuer')}`,
            open: integerFrom(drafts['quellensteuer']?.trim() ?? '') === null,
          },
        ]
      : []),
    {
      id: 'wechselkurs',
      label: tr('grenzgaenger.lohnausweis.wechselkurs.title'),
      open: salaryCertificate.exchangeRate === null && rate.trim() === '',
    },
  ]
  const openRequiredFields = requiredFieldDefs.filter((f) => f.open)

  function handleFieldTextChange(fieldId: string, nextText: string) {
    setDrafts((prev) => {
      const next = { ...prev, [fieldId]: nextText }
      if (fieldId === 'bruttolohn-total') {
        setManualGrossOverride(nextText.trim() !== '')
        return next
      }
      if (isAdditionalGrossComponent(fieldId) && !manualGrossOverride) {
        const sum = GROSS_COMPONENT_IDS.reduce((acc, id) => {
          const v = salaryAmountFrom(id === fieldId ? nextText : next[id] ?? '', id)
          return acc + (v ?? 0)
        }, 0)
        if (sum > 0) {
          next['bruttolohn-total'] = String(sum)
        }
      }
      return next
    })
  }

  function applyCalculatedGrossSum() {
    if (calculatedGrossSum <= 0) return
    setManualGrossOverride(false)
    setDrafts((prev) => ({ ...prev, 'bruttolohn-total': String(calculatedGrossSum) }))
    onSetField({ jahr: taxYear, feld: 'bruttolohn-total', data: { kind: 'erfasst', value: calculatedGrossSum } })
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('grenzgaenger.back')} onPress={onBack} /> : <BackButtonSpacer />}
        <Text style={styles.heading}>{tr('grenzgaenger.lohnausweis.title')}</Text>
      </View>
      {partnerName !== undefined ? <Text style={styles.help} testID="ch-partner-hinweis">{tr('grenzgaenger.partnerFor', { name: partnerName })}</Text> : null}
      <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.help')}</Text>

      <CrossBorderReceiptUpload taxYear={taxYear} {...(partnerName !== undefined ? { partnerName } : {})} />

      {openRequiredFields.length > 0 ? (
        <CrossBorderMissingFields openRequiredFields={openRequiredFields} drawerOpen={missingDrawerOpen} onToggleDrawer={() => setMissingDrawerOpen((o) => !o)} />
      ) : null}

      {amountFields.map((field) => {
        const isRequired = field.itemsRelevant && (field.id !== 'quellensteuer' || status !== 'kein-grenzgaenger')
        return (
          <View key={field.id}>
            {field.id === 'bruttolohn-total' && calculatedGrossSum > 0 ? (
              <View style={styles.liveSumBanner} testID="ch-bruttolohn-summe-banner">
                <Text style={styles.liveSumText}>
                  {`∑ Automatische Summe (Ziff. 1–7): ${calculatedGrossSum.toLocaleString('de-DE')} CHF`}
                </Text>
                {currentGrossInt !== calculatedGrossSum ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={applyCalculatedGrossSum}
                    style={styles.liveSumApplyBtn}
                    testID="ch-bruttolohn-summe-uebernehmen"
                  >
                    <Text style={styles.liveSumApplyText}>Summe übernehmen</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <ChFieldInput
              fieldId={field.id}
              digit={field.digit}
              required={isRequired}
              value={drafts[field.id] ?? ''}
              initial={valueFromResponse(salaryCertificate, field.id)}
              onChangeText={(next) => handleFieldTextChange(field.id, next)}
              onCommit={(value) => {
                onSetField({ jahr: taxYear, feld: field.id, data: value })
                // When an additional allowance (Ziffer 2–7) is committed and Ziffer 8 wasn't manually overridden, persist the live sum to Ziffer 8 too.
                if (isAdditionalGrossComponent(field.id) && !manualGrossOverride && calculatedGrossSum > 0) {
                  onSetField({ jahr: taxYear, feld: 'bruttolohn-total', data: { kind: 'erfasst', value: calculatedGrossSum } })
                }
              }}
            />
          </View>
        )
      })}

      <CrossBorderExchangeRate
        taxYear={taxYear}
        month={month}
        onMonthChange={setMonth}
        rate={rate}
        onRateChange={setRate}
        onSetExchangeRate={onSetExchangeRate}
      />

      <ProvisionSection salaryCertificate={salaryCertificate} nGre={salaryCertificate.nGre} onSet={onSetProvision} onSetNGre={onSetNGre} />

      <NGreSection nGre={salaryCertificate.nGre} salaryCertificate={salaryCertificate} taxYear={taxYear} onSet={onSetNGre} />

      <CrossBorderStatusCards status={status} foldStatus={foldStatus} />

      <Button onPress={onDone} style={styles.cta} testID="ch-lohnausweis-weiter">
        {tr('grenzgaenger.lohnausweis.done')}
      </Button>
    </ScrollView>
  )
}
