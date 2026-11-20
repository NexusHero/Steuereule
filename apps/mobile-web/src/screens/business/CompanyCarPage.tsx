import { useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import { useBusinessControllerBookCompanyCar, useBusinessControllerCompanyCar, type CompanyCarInputDto, type CompanyCarResultDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, Figure, Note, Section } from './BusinessFrame'
import { Choice } from './Choice'
import { personParams, plainEuro, type ApiProblem } from './businessKit'
import { attempt, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

const DRIVES = ['verbrenner', 'elektro', 'hybrid'] as const
const METHODS = ['pauschal', 'fahrtenbuch'] as const
type Drive = (typeof DRIVES)[number]
type Method = (typeof METHODS)[number]

/** Whole numbers the user typed; empty is absent, anything else invalid. */
function whole(raw: string | undefined): number | undefined | null {
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/**
 * The private use of a business car (ADR-0101 §22): 1 %-Regel or Fahrtenbuch, the trips home–business,
 * the VAT on the Wertabgabe. The page computes first and books only on „Buchen“.
 */
export function CompanyCarPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const compute = useBusinessControllerCompanyCar()
  const book = useBusinessControllerBookCompanyCar()
  const refresh = useRefreshBusiness(taxYear)
  const [drive, setDrive] = useState<Drive>('verbrenner')
  const [method, setMethod] = useState<Method>('pauschal')
  const [over50, setOver50] = useState(true)
  const [values, setValues] = useState<Readonly<Record<string, string>>>({ monthsInBusiness: '12' })
  const [result, setResult] = useState<CompanyCarResultDto | null>(null)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [booked, setBooked] = useState(false)

  function input(): CompanyCarInputDto | null {
    const n = (key: string) => whole(values[key])
    const numbers = ['listPriceGrossEur', 'monthsInBusiness', 'co2GPerKm', 'electricRangeKm', 'totalCostsEur', 'depreciationEur', 'totalKm', 'costsWithInputVatEur', 'distanceKm', 'days', 'privatePercent'].map((k) => [k, n(k)] as const)
    if (numbers.some(([, v]) => v === null)) return null
    const get = (k: string) => numbers.find(([key]) => key === k)?.[1] ?? undefined
    const listPrice = get('listPriceGrossEur')
    const acquired = (values.acquired ?? '').trim()
    if (listPrice === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(acquired)) return null
    const optional = (k: keyof CompanyCarInputDto, v: number | undefined) => (v === undefined ? {} : { [k]: v })
    const distance = get('distanceKm')
    const days = get('days')
    const percent = get('privatePercent')
    return {
      drive,
      acquired,
      listPriceGrossEur: listPrice,
      businessShareOver50: over50,
      monthsInBusiness: get('monthsInBusiness') ?? 12,
      method,
      ...optional('co2GPerKm', get('co2GPerKm')),
      ...optional('electricRangeKm', get('electricRangeKm')),
      ...optional('totalCostsEur', get('totalCostsEur')),
      ...optional('depreciationEur', get('depreciationEur')),
      ...optional('totalKm', get('totalKm')),
      ...optional('costsWithInputVatEur', get('costsWithInputVatEur')),
      ...(percent !== undefined ? { privateShare: Math.min(100, percent) / 100 } : {}),
      ...(distance !== undefined && days !== undefined ? { commute: { distanceKm: distance, days } } : {}),
    }
  }

  async function run(kind: 'compute' | 'book') {
    setProblem(null)
    setBooked(false)
    const data = input()
    if (data === null) return setInvalid(true)
    setInvalid(false)
    const args = { jahr: taxYear, data, ...(params ? { params } : {}) }
    if (kind === 'compute') {
      const outcome = await attempt(() => compute.mutateAsync(args))
      if (outcome.ok) setResult(outcome.response.data as CompanyCarResultDto)
      else setProblem(outcome.problem)
      return
    }
    const outcome = await attempt(() => book.mutateAsync(args))
    if (outcome.ok) {
      setBooked(true)
      refresh()
    } else setProblem(outcome.problem)
  }

  const field = (key: string, opts: { placeholder?: string } = {}) => (
    <Feld key={key} label={tr(`business.kfz.feld.${key}`)}>
      <Input
        type={key === 'acquired' ? 'text' : 'numeric'}
        mono
        value={values[key] ?? ''}
        onChange={(v) => setValues((s) => ({ ...s, [key]: v }))}
        placeholder={opts.placeholder ?? '0'}
        accessibilityLabel={tr(`business.kfz.feld.${key}`)}
        testID={`kfz-${key}`}
      />
    </Feld>
  )
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.s2, marginBottom: t.space.s3 }

  return (
    <BusinessFrame title={tr('business.seite.firmenwagen')} onBack={onBack} testID="firmenwagen-seite">
      <Note>{tr('business.kfz.hinweis')}</Note>
      <Section title={tr('business.kfz.fahrzeug')}>
        <View style={row}>
          {DRIVES.map((d) => (
            <Choice key={d} selected={drive === d} onPress={() => setDrive(d)} testID={`kfz-antrieb-${d}`}>
              {tr(`business.kfz.antrieb.${d}`)}
            </Choice>
          ))}
        </View>
        {field('listPriceGrossEur')}
        {field('acquired', { placeholder: 'JJJJ-MM-TT' })}
        {drive === 'hybrid' ? [field('co2GPerKm'), field('electricRangeKm')] : null}
        {field('monthsInBusiness', { placeholder: '12' })}
      </Section>
      <Section title={tr('business.kfz.methode')}>
        <View style={row}>
          {METHODS.map((m) => (
            <Choice key={m} selected={method === m} onPress={() => setMethod(m)} testID={`kfz-methode-${m}`}>
              {tr(`business.kfz.methoden.${m}`)}
            </Choice>
          ))}
        </View>
        <View style={row}>
          <Choice selected={over50} onPress={() => setOver50(true)} testID="kfz-ueber50-ja">
            {tr('business.kfz.ueber50.ja')}
          </Choice>
          <Choice selected={!over50} onPress={() => setOver50(false)} testID="kfz-ueber50-nein">
            {tr('business.kfz.ueber50.nein')}
          </Choice>
        </View>
        {field('totalCostsEur')}
        {method === 'fahrtenbuch' ? [field('depreciationEur'), field('privatePercent'), field('totalKm'), field('costsWithInputVatEur')] : null}
      </Section>
      <Section title={tr('business.kfz.wege')}>
        {field('distanceKm')}
        {field('days')}
      </Section>
      {invalid ? <Note tone="error">{tr('business.kfz.ungueltig')}</Note> : null}
      {problem !== null ? <Note tone="error">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      <Button variant="ghost" onPress={() => void run('compute')} testID="kfz-berechnen">
        {tr('business.kfz.berechnen')}
      </Button>
      {result !== null ? <CarResult result={result} /> : null}
      {result?.kind === 'berechnet' ? (
        <Button onPress={() => void run('book')} testID="kfz-buchen">
          {tr('business.kfz.buchen')}
        </Button>
      ) : null}
      {booked ? <Note testID="kfz-gebucht">{tr('business.kfz.gebucht')}</Note> : null}
    </BusinessFrame>
  )
}

function CarResult({ result }: { readonly result: CompanyCarResultDto }) {
  const { t: tr } = useTranslation(APP_NS)
  if (result.kind === 'nicht_zulaessig') return <Note tone="warn" testID="kfz-nicht-zulaessig">{tr('business.kfz.nichtZulaessig')}</Note>
  if (result.kind === 'offen') return <Note tone="warn" testID="kfz-offen">{tr('business.kfz.offen')}</Note>
  return (
    <Section testID="kfz-ergebnis">
      {result.factor !== undefined && result.factor !== 1 ? <Note>{tr('business.kfz.bruchteil', { anteil: String(result.factor).replace('.', ',') })}</Note> : null}
      <Figure strong label={tr('business.kfz.privatanteil')} value={plainEuro(result.privateUseEur ?? 0)} testID="kfz-privatanteil" />
      {result.vat ? <Figure label={tr('business.kfz.umsatzsteuer')} value={plainEuro(result.vat.vatEur)} testID="kfz-ust" /> : null}
      {result.commute ? <Figure label={tr('business.kfz.wegeNichtAbziehbar')} value={plainEuro(result.commute.nonDeductibleEur)} testID="kfz-wege" /> : null}
      {result.capped ? <Note>{tr('business.kfz.gedeckelt')}</Note> : null}
    </Section>
  )
}
