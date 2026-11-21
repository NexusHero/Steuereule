import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import { PayrollRunInputDtoChurch, useBusinessControllerAddPayrollRun, useBusinessControllerPayroll, type PayrollRunInputDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { Choice } from './Choice'
import { personParams, plainEuro, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

const KZ_FIRST = ['86', '90', '42', '41', '44', '45', '48', '49', '47', '61', '62'] as const
/** The Anmeldung's lines in form order; the Land lines for other communities (63–78) after 62, 83 last. */
const kzOrder = (kennzahlen: Readonly<Record<string, number>>) => [
  ...KZ_FIRST.filter((kz) => kennzahlen[kz] !== undefined),
  ...Object.keys(kennzahlen).filter((kz) => !(KZ_FIRST as readonly string[]).includes(kz) && kz !== '83').sort((a, b) => a.localeCompare(b)),
  ...(kennzahlen['83'] !== undefined ? ['83'] : []),
]
const KNOWN_KZ: ReadonlySet<string> = new Set([...KZ_FIRST, '83'])
const AMOUNTS = ['wageTaxEur', 'soliEur', 'churchTaxEur', 'employeeSocialEur', 'employerSocialEur', 'flatWageTaxEur', 'flat37bTaxEur', 'flatChurchTaxEur', 'bavSupportEur'] as const
type Church = NonNullable<PayrollRunInputDto['church']>
const OTHER_CHURCHES = Object.values(PayrollRunInputDtoChurch).filter((c) => c !== 'ev' && c !== 'rk')
const dateDe = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
const euro = (raw: string | undefined): number | undefined | null => {
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * The wages of the business's employees (ADR-0101 §22): runs of the outside payroll booked, a Minijob
 * computed, the Lohnsteuer-Anmeldung as fill-in help. Social security reports stay with the payroll.
 */
export function PayrollPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const query = useBusinessControllerPayroll(taxYear, params)
  const add = useBusinessControllerAddPayrollRun()
  const refresh = useRefreshBusiness(taxYear)
  const [kind, setKind] = useState<'regulaer' | 'minijob'>('regulaer')
  const [church, setChurch] = useState<Church | null>(null)
  const [otherChurch, setOtherChurch] = useState(false)
  const [privatelyInsured, setPrivatelyInsured] = useState(false)
  const [rvExempt, setRvExempt] = useState(false)
  const [over30, setOver30] = useState(false)
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})
  const [invalid, setInvalid] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.lohn')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const data = query.data.data

  async function submit() {
    setProblem(null)
    const month = Number(values.month)
    const gross = euro(values.grossEur)
    const employee = (values.employee ?? '').trim()
    const extra = AMOUNTS.map((k) => [k, euro(values[k])] as const)
    if (!(month >= 1 && month <= 12) || gross === undefined || gross === null || employee === '' || extra.some(([, v]) => v === null)) return setInvalid(true)
    setInvalid(false)
    const body: PayrollRunInputDto = {
      month,
      kind,
      employee,
      grossEur: gross,
      ...(kind === 'regulaer' ? { ...Object.fromEntries(extra.filter(([, v]) => v !== undefined)), church } : { statutoryHealthInsured: !privatelyInsured, rvExempt, u1Applies: !over30 }),
    }
    const outcome = await attempt(() => add.mutateAsync({ jahr: taxYear, data: body, ...(params ? { params } : {}) }))
    if (!outcome.ok) return setProblem(outcome.problem)
    setValues({})
    refresh()
    void query.refetch()
  }

  const field = (key: string, placeholder = '0') => (
    <Feld key={key} label={tr(`business.lohn.feld.${key}`)}>
      <Input type={key === 'employee' ? 'text' : 'numeric'} mono={key !== 'employee'} value={values[key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} placeholder={placeholder} accessibilityLabel={tr(`business.lohn.feld.${key}`)} testID={`lohn-${key}`} />
    </Feld>
  )
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.s2, marginBottom: t.space.s3 }

  return (
    <BusinessFrame title={tr('business.seite.lohn')} onBack={onBack} testID="lohn-seite">
      <Note>{tr('business.lohn.hinweis')}</Note>
      <Section title={tr('business.lohn.neu')}>
        <View style={row}>
          {(['regulaer', 'minijob'] as const).map((k) => (
            <Choice key={k} selected={kind === k} onPress={() => setKind(k)} testID={`lohn-art-${k}`}>
              {tr(`business.lohn.art.${k}`)}
            </Choice>
          ))}
        </View>
        {field('employee', '')}
        {field('month', '1–12')}
        {field('grossEur')}
        {kind === 'regulaer' ? (
          <>
            {AMOUNTS.map((k) => field(k))}
            <View style={row}>
              {(['ev', 'rk'] as const).map((c) => (
                <Choice
                  key={c}
                  selected={church === c}
                  onPress={() => {
                    setOtherChurch(false)
                    setChurch(church === c ? null : c)
                  }}
                  testID={`lohn-kirche-${c}`}
                >
                  {tr(`business.lohn.kirche.${c}`)}
                </Choice>
              ))}
              <Choice
                selected={otherChurch}
                onPress={() => {
                  setOtherChurch(!otherChurch)
                  setChurch(null)
                }}
                testID="lohn-kirche-andere"
              >
                {tr('business.lohn.kirche.andere')}
              </Choice>
            </View>
            {otherChurch ? (
              <View style={row}>
                {OTHER_CHURCHES.map((c) => (
                  <Choice key={c} selected={church === c} onPress={() => setChurch(church === c ? null : c)} testID={`lohn-kirche-${c}`}>
                    {c.toUpperCase()}
                  </Choice>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={row}>
            <Choice selected={privatelyInsured} onPress={() => setPrivatelyInsured(!privatelyInsured)} testID="lohn-privat-versichert">
              {tr('business.lohn.privatVersichert')}
            </Choice>
            <Choice selected={rvExempt} onPress={() => setRvExempt(!rvExempt)} testID="lohn-rv-befreit">
              {tr('business.lohn.rvBefreit')}
            </Choice>
            <Choice selected={over30} onPress={() => setOver30(!over30)} testID="lohn-ueber-30">
              {tr('business.lohn.ueber30')}
            </Choice>
          </View>
        )}
        {invalid ? <Note tone="error">{tr('business.lohn.ungueltig')}</Note> : null}
        {problem !== null ? <Note tone="error">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
        <Button onPress={() => void submit()} testID="lohn-buchen">
          {tr('business.lohn.buchen')}
        </Button>
      </Section>

      <Section title={tr('business.lohn.laeufe')} testID="lohn-laeufe">
        {data.runs.length === 0 ? <Note>{tr('business.lohn.keine')}</Note> : null}
        {data.runs.map((r) => (
          <Figure key={r.id} label={`${String(r.month).padStart(2, '0')}/${taxYear} · ${r.employee} · ${tr(`business.lohn.art.${r.kind}`)}`} value={plainEuro(r.grossEur)} />
        ))}
      </Section>

      <Section title={tr('business.lohn.anmeldung', { zeitraum: tr(`business.lohn.zeitraum.${data.wageTaxPeriod}`) })} testID="lohn-anmeldungen">
        {data.wageTaxReturns.map((w) => (
          <View key={w.label} style={{ marginBottom: t.space.s3 }} testID={`lohn-lsta-${w.label}`}>
            <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }}>{`${w.label} · ${tr('business.va.faellig', { datum: dateDe(w.due) })}`}</Text>
            {kzOrder(w.kennzahlen).map((kz) => (
              <Figure key={kz} label={`Kz ${kz} · ${tr(KNOWN_KZ.has(kz) ? `business.lohn.kz.${kz}` : 'business.lohn.kz.land')}`} value={kz === '86' || kz === '90' ? String(w.kennzahlen[kz]) : plainEuro(w.kennzahlen[kz]!)} />
            ))}
          </View>
        ))}
        {data.unassignedChurchCodes.length > 0 ? (
          <Note tone="error" testID="lohn-kirche-ohne-zeile">
            {tr('business.lohn.kircheOhneZeile', { kuerzel: data.unassignedChurchCodes.map((c) => c.toUpperCase()).join(', ') })}
          </Note>
        ) : null}
      </Section>

      {data.minijobCharges.length > 0 ? (
        <Section title={tr('business.lohn.minijobAbgaben')} testID="lohn-minijob">
          <Note>{tr('business.lohn.minijobHinweis')}</Note>
          {data.minijobCharges.map((m) => (
            <Figure key={m.month} label={`${String(m.month).padStart(2, '0')}/${taxYear}`} value={plainEuro(m.totalEur)} />
          ))}
        </Section>
      ) : null}
    </BusinessFrame>
  )
}
