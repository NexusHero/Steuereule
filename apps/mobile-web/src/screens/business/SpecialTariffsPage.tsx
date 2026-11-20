import { useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import { useBusinessControllerSpecialTariffs, type DisposalFactsDto, type RetainedFactsDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { Choice } from './Choice'
import { personParams, plainEuro } from './businessKit'
import { queryProblem } from './useBusiness'
import { useProfileEditor } from './useProfileEditor'
import type { BusinessPageProps } from './BusinessScreen'

const KINDS = ['veraeusserung', 'aufgabe'] as const
const METHODS = ['fuenftel', 'ermaessigt', 'keine'] as const

const amount = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Selling or giving up the business (§ 16, § 34 EStG) and the Thesaurierung of a Bilanzierer
 * (§ 34a EStG), ADR-0101 §22. The facts are saved with the business; the estimate takes them.
 */
export function SpecialTariffsPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const result = useBusinessControllerSpecialTariffs(taxYear, personParams(person, business))
  const editor = useProfileEditor(taxYear, person, business)
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null)
  const [method, setMethod] = useState<(typeof METHODS)[number] | null>(null)
  const [allowance, setAllowance] = useState<boolean | null>(null)
  const [invalid, setInvalid] = useState(false)
  const loadProblem = queryProblem(editor.query)

  if (editor.query.isPending || editor.profile === null || loadProblem !== null) {
    return (
      <BusinessFrame title={tr('business.seite.sondertarife')} onBack={onBack}>
        <BusinessQueryState pending={editor.query.isPending} problem={loadProblem} onRetry={() => void editor.query.refetch()} />
      </BusinessFrame>
    )
  }
  const stored = editor.profile.disposalFacts
  const storedRetained = editor.profile.retainedFacts
  const shown = (key: string, current: number | string | undefined | null) => values[key] ?? (current === undefined || current === null ? '' : String(current))
  const computed = result.data?.status === 200 ? result.data.data : null

  async function saveDisposal() {
    const price = amount(shown('priceEur', stored?.priceEur))
    const costs = amount(shown('costsEur', stored?.costsEur)) ?? 0
    const capital = amount(shown('capitalAccountEur', stored?.capitalAccountEur))
    const date = shown('date', stored?.date).trim()
    if (price === null || capital === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setInvalid(true)
    setInvalid(false)
    const facts: DisposalFactsDto = {
      kind: kind ?? stored?.kind ?? 'veraeusserung',
      date,
      priceEur: price,
      costsEur: costs,
      capitalAccountEur: capital,
      allowance: allowance ?? stored?.allowance ?? false,
      method: method ?? stored?.method ?? 'fuenftel',
    }
    if (await editor.save({ disposalFacts: facts })) void result.refetch()
  }

  async function saveRetained() {
    const requested = amount(shown('requestedEur', storedRetained?.requestedEur))
    if (requested === null) return setInvalid(true)
    setInvalid(false)
    const carried = amount(shown('carriedForwardEur', storedRetained?.carriedForwardEur))
    const forTax = amount(shown('withdrawalsForRetainedTaxEur', storedRetained?.withdrawalsForRetainedTaxEur))
    const facts: RetainedFactsDto = { requestedEur: requested, ...(carried !== null ? { carriedForwardEur: carried } : {}), ...(forTax !== null ? { withdrawalsForRetainedTaxEur: forTax } : {}) }
    if (await editor.save({ retainedFacts: facts })) void result.refetch()
  }

  const field = (key: string, current: number | string | undefined | null, placeholder = '0') => (
    <Feld key={key} label={tr(`business.sonder.feld.${key}`)}>
      <Input type={key === 'date' ? 'text' : 'numeric'} mono value={shown(key, current)} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} placeholder={placeholder} accessibilityLabel={tr(`business.sonder.feld.${key}`)} testID={`sonder-${key}`} />
    </Feld>
  )
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.s2, marginBottom: t.space.s3 }
  const currentKind = kind ?? stored?.kind ?? 'veraeusserung'
  const currentMethod = method ?? stored?.method ?? 'fuenftel'
  const currentAllowance = allowance ?? stored?.allowance ?? false

  return (
    <BusinessFrame title={tr('business.seite.sondertarife')} onBack={onBack} testID="sondertarife-seite">
      {editor.problem !== null ? <Note tone="error">{editor.problem.message ?? tr('business.speichernFehler')}</Note> : null}
      {invalid ? <Note tone="error">{tr('business.sonder.ungueltig')}</Note> : null}
      <Section title={tr('business.sonder.aufgabe')}>
        <Note>{tr('business.sonder.aufgabeHinweis')}</Note>
        <View style={row}>
          {KINDS.map((k) => (
            <Choice key={k} selected={currentKind === k} onPress={() => setKind(k)} testID={`sonder-art-${k}`}>
              {tr(`business.sonder.art.${k}`)}
            </Choice>
          ))}
        </View>
        {field('date', stored?.date, 'JJJJ-MM-TT')}
        {field('priceEur', stored?.priceEur)}
        {field('costsEur', stored?.costsEur)}
        {field('capitalAccountEur', stored?.capitalAccountEur)}
        <View style={row}>
          <Choice selected={currentAllowance} onPress={() => setAllowance(!currentAllowance)} testID="sonder-freibetrag">
            {tr('business.sonder.freibetrag')}
          </Choice>
        </View>
        <View style={row}>
          {METHODS.map((m) => (
            <Choice key={m} selected={currentMethod === m} onPress={() => setMethod(m)} testID={`sonder-methode-${m}`}>
              {tr(`business.sonder.methode.${m}`)}
            </Choice>
          ))}
        </View>
        <Button onPress={() => void saveDisposal()} testID="sonder-aufgabe-speichern">
          {tr('business.sonder.speichern')}
        </Button>
        {computed?.disposal ? (
          <View testID="sonder-gewinn">
            <Figure label={tr('business.sonder.gewinn')} value={plainEuro(computed.disposal.gainEur)} />
            <Figure label={tr('business.sonder.freibetragBetrag')} value={plainEuro(computed.disposal.allowanceEur)} />
            <Figure strong label={tr('business.sonder.steuerpflichtig')} value={plainEuro(computed.disposal.taxableGainEur)} testID="sonder-steuerpflichtig" />
          </View>
        ) : null}
      </Section>

      <Section title={tr('business.sonder.thesaurierung')}>
        <Note>{tr('business.sonder.thesaurierungHinweis')}</Note>
        {field('requestedEur', storedRetained?.requestedEur)}
        {field('carriedForwardEur', storedRetained?.carriedForwardEur)}
        {field('withdrawalsForRetainedTaxEur', storedRetained?.withdrawalsForRetainedTaxEur)}
        <Button variant="ghost" onPress={() => void saveRetained()} testID="sonder-thesaurierung-speichern">
          {tr('business.sonder.speichern')}
        </Button>
        {computed?.retainedOnlyBilanz ? <Note tone="warn" testID="sonder-nur-bilanz">{tr('business.sonder.nurBilanz')}</Note> : null}
        {computed?.retained ? (
          <View testID="sonder-thesaurierung-ergebnis">
            <Figure label={tr('business.sonder.nichtEntnommen')} value={plainEuro(computed.retained.nonWithdrawnEur)} />
            <Figure label={tr('business.sonder.beguenstigt')} value={plainEuro(computed.retained.favouredEur)} />
            <Figure strong label={tr('business.sonder.thesaurierungSteuer', { satz: String(computed.retained.rate * 100).replace('.', ',') })} value={plainEuro(computed.retained.taxEur)} />
            {computed.retained.recaptureEur > 0 ? <Figure label={tr('business.sonder.nachversteuerung')} value={plainEuro(computed.retained.recaptureEur)} /> : null}
            <Figure label={tr('business.sonder.vortrag')} value={plainEuro(computed.retained.nextCarriedForwardEur)} />
          </View>
        ) : null}
      </Section>
    </BusinessFrame>
  )
}
