import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import { useBusinessControllerClosing, useBusinessControllerQuickEntry } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { eurosToCents, personParams, plainCents, signedEuro, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

/** The EÜR lines most businesses book as one total; every other line is booked in the Buch. */
const INCOME_KEYS = ['einnahmen_umsatzsteuerpflichtig', 'einnahmen_umsatzsteuerfrei', 'einnahmen_kleinunternehmer'] as const
const EXPENSE_KEYS = [
  'ausgaben_waren_rohstoffe',
  'ausgaben_fremdleistungen',
  'ausgaben_personal',
  'ausgaben_raumkosten',
  'ausgaben_kfz',
  'ausgaben_reise',
  'ausgaben_telekommunikation',
  'ausgaben_fortbildung',
  'ausgaben_rechts_beratung',
  'ausgaben_versicherungen_beitraege',
  'ausgaben_werbung',
  'ausgaben_schuldzinsen',
  'ausgaben_sonstige',
] as const

/** The quick path (ADR-0101 §6): one total per EÜR line; each becomes a booking in the Buch. */
export function QuickEntryPage({ taxYear, person, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person)
  const closing = useBusinessControllerClosing(taxYear, params)
  const quick = useBusinessControllerQuickEntry()
  const refresh = useRefreshBusiness(taxYear)
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [done, setDone] = useState(false)

  const loadProblem = queryProblem(closing)
  if (closing.isPending || loadProblem !== null || closing.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.erfassung')} onBack={onBack}>
        <BusinessQueryState pending={closing.isPending} problem={loadProblem} onRetry={() => void closing.refetch()} />
      </BusinessFrame>
    )
  }
  const sheet = closing.data.data
  const euer = sheet.mode === 'euer'
  const income = sheet.euer?.totals.einnahmen ?? null
  const expenses = sheet.euer?.totals.ausgaben ?? null
  const profit = sheet.euer?.profit.profitEur ?? null

  async function submit() {
    setProblem(null)
    setDone(false)
    const totals: { key: string; amountCents: number }[] = []
    for (const [key, raw] of Object.entries(values)) {
      if (raw.trim() === '') continue
      const cents = eurosToCents(raw)
      if (cents === null) return setInvalid(true)
      if (cents > 0) totals.push({ key, amountCents: cents })
    }
    setInvalid(false)
    if (totals.length === 0) return
    const result = await attempt(() => quick.mutateAsync({ jahr: taxYear, data: { totals }, ...(params ? { params } : {}) }))
    if (result.ok) {
      setValues({})
      setDone(true)
      refresh()
    } else setProblem(result.problem)
  }

  const field = (key: string) => (
    <Feld key={key} label={tr(`business.erfassung.zeile.${key}`)}>
      <Input type="numeric" mono value={values[key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} placeholder="0,00" accessibilityLabel={tr(`business.erfassung.zeile.${key}`)} testID={`erfassung-${key}`} />
    </Feld>
  )

  return (
    <BusinessFrame title={tr('business.seite.erfassung')} onBack={onBack} testID="erfassung-seite">
      {!euer ? <Note testID="erfassung-nur-euer">{tr('business.erfassung.nurEuer')}</Note> : null}
      <Section title={tr('business.erfassung.stand')}>
        <Figure label={tr('business.erfassung.einnahmen')} value={income === null ? '–' : plainCents(income)} testID="erfassung-einnahmen" />
        <Figure label={tr('business.erfassung.ausgaben')} value={expenses === null ? '–' : plainCents(expenses)} testID="erfassung-ausgaben" />
        <Figure strong label={tr('business.erfassung.gewinn')} value={profit === null ? '–' : signedEuro(profit)} testID="erfassung-gewinn" />
      </Section>
      {euer ? (
        <>
          <Section title={tr('business.erfassung.einnahmenTitel')}>{INCOME_KEYS.map(field)}</Section>
          <Section title={tr('business.erfassung.ausgabenTitel')}>{EXPENSE_KEYS.map(field)}</Section>
          {invalid ? <Note tone="error">{tr('business.erfassung.ungueltig')}</Note> : null}
          {problem !== null ? <Note tone="error" testID="business-speichern-fehler">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
          {done ? <Text style={{ ...t.type.body, color: t.color.ok }} testID="erfassung-gebucht">{tr('business.erfassung.gebucht')}</Text> : null}
          <Button onPress={() => void submit()} testID="erfassung-buchen">
            {tr('business.erfassung.buchen')}
          </Button>
        </>
      ) : null}
    </BusinessFrame>
  )
}
