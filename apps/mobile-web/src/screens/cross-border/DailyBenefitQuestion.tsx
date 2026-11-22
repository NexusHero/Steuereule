import { useState } from 'react'
import { Text, View, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, Feld, useTheme } from '@steuereule/ui'
import {
  DAILY_BENEFIT_SOURCES,
  ahvContributionFit,
  dailyBenefitAmountField,
  dailyBenefitEntry,
  formatChf,
  goesAgainstRecommendation,
  isDailyBenefitSource,
  recommendedDailyBenefitSource,
  type DailyBenefitAmountField,
  type DailyBenefitSource,
} from '@steuereule/core'
import type { NGreDetailsDto, PutNGreDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { NGreInput } from './NGreInput'

const AMOUNT_FIELDS: readonly DailyBenefitAmountField[] = ['steuerfreiesKrankentaggeldChf', 'steuerfreiesUnfalltaggeldChf']

/**
 * „Woher kam das Taggeld im Bruttolohn?“ (ADR-0072, Punkt 5): the answer first, then only the amount field
 * that fits it — the insurer's benefit and the accident benefit are deducted, the employer's continued pay
 * is wage. Beside it the AHV hint from Ziffer 8 and 9, never the decision. A sickness amount recorded and
 * Ziffer 9 fitting the wage without it make the insurance the recommendation; keeping it as wage then
 * shows the contradiction (the user still decides).
 */
export function DailyBenefitQuestion({
  nGre,
  grossWageChf,
  ahvContributionsChf,
  taxYear,
  onSet,
}: {
  readonly nGre: NGreDetailsDto
  readonly grossWageChf: number | null
  readonly ahvContributionsChf: number | null
  readonly taxYear: number
  readonly onSet: (data: PutNGreDto) => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s3 }
  const stored = nGre.taggeldQuelle ?? null
  const [source, setSource] = useState<DailyBenefitSource | null>(isDailyBenefitSource(stored) ? stored : null)
  const [amounts, setAmounts] = useState<Record<DailyBenefitAmountField, number | null>>({
    steuerfreiesKrankentaggeldChf: nGre.steuerfreiesKrankentaggeldChf ?? null,
    steuerfreiesUnfalltaggeldChf: nGre.steuerfreiesUnfalltaggeldChf ?? null,
  })

  // The last sickness amount recorded: it stays the basis of the check after an answer that clears the field.
  const [lastSicknessChf, setLastSicknessChf] = useState<number | null>((nGre.steuerfreiesKrankentaggeldChf ?? 0) > 0 ? nGre.steuerfreiesKrankentaggeldChf! : null)

  const choose = (next: DailyBenefitSource) => {
    const field = dailyBenefitAmountField(next)
    const entry = dailyBenefitEntry(next, field === null ? null : amounts[field])
    setSource(next)
    setAmounts({ steuerfreiesKrankentaggeldChf: entry.steuerfreiesKrankentaggeldChf, steuerfreiesUnfalltaggeldChf: entry.steuerfreiesUnfalltaggeldChf })
    onSet(entry)
  }

  // Before the answer only an amount recorded earlier is shown, so nothing stored stays out of sight.
  const shown: readonly DailyBenefitAmountField[] =
    source === null ? AMOUNT_FIELDS.filter((field) => (amounts[field] ?? 0) > 0) : [dailyBenefitAmountField(source)].filter((field): field is DailyBenefitAmountField => field !== null)
  const candidate = shown.length === 1 ? amounts[shown[0]!] : null
  const fit =
    candidate !== null && candidate > 0 && grossWageChf !== null && ahvContributionsChf !== null
      ? ahvContributionFit({ taxYear, grossWageChf, ahvContributionsChf, candidateChf: candidate, familyAllowancesChf: nGre.familienzulagenImBruttolohn === true ? (nGre.familienzulagenChf ?? 0) : 0 })
      : null

  const sicknessFit =
    lastSicknessChf !== null && grossWageChf !== null && ahvContributionsChf !== null
      ? ahvContributionFit({ taxYear, grossWageChf, ahvContributionsChf, candidateChf: lastSicknessChf, familyAllowancesChf: nGre.familienzulagenImBruttolohn === true ? (nGre.familienzulagenChf ?? 0) : 0 })
      : null
  const recommended = recommendedDailyBenefitSource('sickness', sicknessFit)
  const contradiction = source !== null && goesAgainstRecommendation(source, recommended)

  return (
    <>
      <Feld label={tr('grenzgaenger.nGre.taggeld.frage')}>
        <Text style={help}>{tr('grenzgaenger.nGre.taggeld.hilfe')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          {DAILY_BENEFIT_SOURCES.map((option) => (
            <Chip key={option} active={source === option} onPress={() => choose(option)} testID={`ch-ngre-taggeldQuelle-${option}`}>
              {tr(`grenzgaenger.nGre.taggeld.quelle.${option}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {fit !== null ? (
        <Text style={help} testID="ch-ngre-taggeld-ahv-hinweis">
          {tr(`grenzgaenger.nGre.taggeld.ahv.${fit.reason}`, {
            ziffer9: formatChf(fit.ahvContributionsChf),
            mit: formatChf(fit.expectedWithChf),
            ohne: formatChf(fit.expectedWithoutChf),
            abstand: formatChf(fit.marginChf),
          })}
        </Text>
      ) : null}
      {recommended !== null && source === null ? (
        <Text style={help} testID="ch-ngre-taggeld-empfehlung">
          {tr('grenzgaenger.nGre.taggeld.empfehlung')}
        </Text>
      ) : null}
      {contradiction ? (
        <Text style={{ ...help, color: t.color.warn }} testID="ch-ngre-taggeld-widerspruch">
          {tr('grenzgaenger.nGre.taggeld.widerspruch', { betrag: formatChf(lastSicknessChf ?? 0) })}
        </Text>
      ) : null}
      {source === 'lohnfortzahlung' ? <Text style={help}>{tr('grenzgaenger.nGre.taggeld.lohnfortzahlung')}</Text> : null}
      {shown.map((field) => (
        <View key={`${source ?? 'offen'}-${field}`}>
          <NGreInput
            label={source === null ? tr(`grenzgaenger.nGre.felder.${field}`) : tr(`grenzgaenger.nGre.taggeld.betrag.${source}`)}
            initial={amounts[field] === null ? '' : String(amounts[field])}
            numeric
            testID={`ch-ngre-${field}`}
            onCommit={(text) => {
              const value = text === '' ? null : Number(text)
              setAmounts((previous) => ({ ...previous, [field]: value }))
              if (field === 'steuerfreiesKrankentaggeldChf' && value !== null && value > 0) setLastSicknessChf(value)
              onSet({ [field]: value })
            }}
          />
          {source !== null ? <Text style={help}>{tr(`grenzgaenger.nGre.taggeld.betragHilfe.${source}`)}</Text> : null}
        </View>
      ))}
    </>
  )
}
