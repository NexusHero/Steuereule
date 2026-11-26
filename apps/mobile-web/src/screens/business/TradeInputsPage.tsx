import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input } from '@steuereule/ui'
import type { FinancingComponentsDto, TradeTaxInputsDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, ProblemNote, Section } from './BusinessFrame'
import { parseGermanAmount } from '../shared/germanNumber'
import { useProfileEditor } from './useProfileEditor'
import type { BusinessPageProps } from './BusinessScreen'

const FINANCING = ['debtChargesEur', 'annuitiesEur', 'silentPartnerSharesEur', 'rentMovableEur', 'rentMovableLowEmissionEur', 'rentImmovableEur', 'licencesEur'] as const satisfies readonly (keyof FinancingComponentsDto)[]
const OTHER = ['otherAdditionsEur', 'einheitswertEur', 'otherDeductionsEur', 'lossCarriedForwardEur'] as const satisfies readonly (keyof TradeTaxInputsDto)[]

/** The inputs of the Gewerbesteuer (§ 8 Nr. 1 parts, Einheitswert, further additions and deductions, Gewerbeverlust); whole euros. */
export function TradeInputsPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { query, profile, loadProblem, save, problem, saving } = useProfileEditor(taxYear, person, business)
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
  const shown = (key: string, current: number | null | undefined) => values[key] ?? (current === null || current === undefined ? '' : String(current).replace('.', ','))

  async function submit() {
    if (saving) return
    /** What the user typed: undefined when untouched, null when emptied, NaN when it is no amount. */
    const typed = (key: string): number | null | undefined => {
      const raw = values[key]
      if (raw === undefined) return undefined
      if (raw.trim() === '') return null
      return parseGermanAmount(raw) ?? Number.NaN
    }
    const all = [...FINANCING, ...OTHER].map(typed)
    if (all.some((n) => Number.isNaN(n))) return setInvalid(true)
    setInvalid(false)
    // The API merges tradeTaxInputs key by key: only what changed goes out, an emptied field as null (removes
    // it). The financing parts are one key, replaced whole, so they go out complete once one of them changed.
    const next: TradeTaxInputsDto = {}
    if (FINANCING.some((key) => values[key] !== undefined)) {
      const financing: FinancingComponentsDto = {}
      for (const key of FINANCING) {
        const n = typed(key)
        const value = n === undefined ? stored.financing?.[key] : n
        if (value !== null && value !== undefined) financing[key] = value
      }
      next.financing = financing
    }
    for (const key of OTHER) {
      const n = typed(key)
      if (n !== undefined) next[key] = n
    }
    if (Object.keys(next).length === 0) return setSaved(true)
    setSaved(await save({ tradeTaxInputs: next }))
  }

  const field = (key: string, current: number | null | undefined) => (
    <Feld key={key} label={tr(`business.gewerbedaten.feld.${key}`)}>
      <Input type="numeric" mono value={shown(key, current)} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} placeholder="0" accessibilityLabel={tr(`business.gewerbedaten.feld.${key}`)} testID={`gewerbedaten-${key}`} />
    </Feld>
  )
  return (
    <BusinessFrame title={tr('business.seite.gewerbedaten')} onBack={onBack} testID="gewerbedaten-seite">
      <ProblemNote problem={problem} testID="business-speichern-fehler" />
      {invalid ? <Note tone="error">{tr('business.gewerbedaten.ungueltig')}</Note> : null}
      <Section title={tr('business.gewerbedaten.finanzierung')}>{FINANCING.map((key) => field(key, stored.financing?.[key]))}</Section>
      <Section>{OTHER.map((key) => field(key, stored[key]))}</Section>
      {saved ? <Note testID="gewerbedaten-gespeichert">{tr('business.gewerbedaten.gespeichert')}</Note> : null}
      <Button onPress={() => void submit()} disabled={saving} testID="gewerbedaten-speichern">
        {tr('business.gewerbedaten.speichern')}
      </Button>
    </BusinessFrame>
  )
}
