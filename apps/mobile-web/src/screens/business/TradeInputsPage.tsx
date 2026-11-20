import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input } from '@steuereule/ui'
import type { FinancingComponentsDto, TradeTaxInputsDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, Section } from './BusinessFrame'
import { useProfileEditor } from './useProfileEditor'
import type { BusinessPageProps } from './BusinessScreen'

const FINANCING = ['debtChargesEur', 'annuitiesEur', 'silentPartnerSharesEur', 'rentMovableEur', 'rentMovableLowEmissionEur', 'rentImmovableEur', 'licencesEur'] as const satisfies readonly (keyof FinancingComponentsDto)[]
const OTHER = ['otherAdditionsEur', 'einheitswertEur', 'otherDeductionsEur', 'lossCarriedForwardEur'] as const satisfies readonly (keyof TradeTaxInputsDto)[]

/** The inputs of the Gewerbesteuer (§ 8 Nr. 1 parts, Einheitswert, further additions and deductions, Gewerbeverlust); whole euros. */
export function TradeInputsPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { query, profile, loadProblem, save, problem } = useProfileEditor(taxYear, person, business)
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})
  const [invalid, setInvalid] = useState(false)
  const [saved, setSaved] = useState(false)

  if (query.isPending || profile === null || loadProblem !== null) {
    return (
      <BusinessFrame title={tr('business.seite.gewerbedaten')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const stored = profile.tradeTaxInputs
  const shown = (key: string, current: number | undefined) => values[key] ?? (current === undefined ? '' : String(current))

  async function submit() {
    const numberOf = (key: string, current: number | undefined): number | undefined | null => {
      const raw = values[key]
      if (raw === undefined) return current
      if (raw.trim() === '') return undefined
      const n = Number(raw.replace(',', '.'))
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    const financing: Record<string, number> = {}
    for (const key of FINANCING) {
      const n = numberOf(key, stored.financing?.[key])
      if (n === null) return setInvalid(true)
      if (n !== undefined) financing[key] = n
    }
    const next: Record<string, unknown> = { financing }
    for (const key of OTHER) {
      const n = numberOf(key, stored[key])
      if (n === null) return setInvalid(true)
      if (n !== undefined) next[key] = n
    }
    setInvalid(false)
    // The API replaces the nested object whole: the complete one goes out.
    setSaved(await save({ tradeTaxInputs: next as TradeTaxInputsDto }))
  }

  const field = (key: string, current: number | undefined) => (
    <Feld key={key} label={tr(`business.gewerbedaten.feld.${key}`)}>
      <Input type="numeric" mono value={shown(key, current)} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} placeholder="0" accessibilityLabel={tr(`business.gewerbedaten.feld.${key}`)} testID={`gewerbedaten-${key}`} />
    </Feld>
  )
  return (
    <BusinessFrame title={tr('business.seite.gewerbedaten')} onBack={onBack} testID="gewerbedaten-seite">
      {problem !== null ? <Note tone="error" testID="business-speichern-fehler">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      {invalid ? <Note tone="error">{tr('business.gewerbedaten.ungueltig')}</Note> : null}
      <Section title={tr('business.gewerbedaten.finanzierung')}>{FINANCING.map((key) => field(key, stored.financing?.[key]))}</Section>
      <Section>{OTHER.map((key) => field(key, stored[key]))}</Section>
      {saved ? <Note testID="gewerbedaten-gespeichert">{tr('business.gewerbedaten.gespeichert')}</Note> : null}
      <Button onPress={() => void submit()} testID="gewerbedaten-speichern">
        {tr('business.gewerbedaten.speichern')}
      </Button>
    </BusinessFrame>
  )
}
