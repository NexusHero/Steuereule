import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Feld, germanDateToIso, Input, useTheme } from '@steuereule/ui'
import {
  useBusinessControllerAssets,
  useBusinessControllerCatalogues,
  type FixedAssetInputDtoCategory,
  useBusinessControllerBookDepreciation,
  useBusinessControllerCreateAsset,
  useBusinessControllerDisposeAsset,
  type FixedAssetInputDtoMethod,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { eurosToCents, personParams, plainCents, type ApiProblem } from './businessKit'
import { CatalogPicker } from './CatalogPicker'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

const METHODS: readonly FixedAssetInputDtoMethod[] = ['linear', 'degressive', 'elektrofahrzeug', 'gwg', 'sofort']

/** Anlagevermögen: the register of the year, a new asset, its disposal, and booking the year's AfA. */
export function AssetsPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const query = useBusinessControllerAssets(taxYear, params)
  const catalogues = useBusinessControllerCatalogues(taxYear, params)
  const categories = catalogues.data?.status === 200 ? catalogues.data.data.assetCategories : []
  const create = useBusinessControllerCreateAsset()
  const dispose = useBusinessControllerDisposeAsset()
  const depreciate = useBusinessControllerBookDepreciation()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [adding, setAdding] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [form, setForm] = useState({ label: '', account: '', date: '', cost: '', method: 'linear' as FixedAssetInputDtoMethod, years: '', category: null as FixedAssetInputDtoCategory | null })
  const [disposing, setDisposing] = useState<string | null>(null)
  const [disposalDate, setDisposalDate] = useState('')
  const [proceeds, setProceeds] = useState('')

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.anlagen')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const rows = query.data.data.register.rows
  const totalBook = rows.reduce((sum, r) => sum + r.closingBookValue, 0)

  async function run(action: () => Promise<{ readonly status: number; readonly data?: unknown }>, after?: () => void) {
    setProblem(null)
    const outcome = await attempt(action)
    if (outcome.ok) {
      after?.()
      refresh()
    } else setProblem(outcome.problem)
  }

  function submitAsset() {
    const cents = eurosToCents(form.cost)
    const date = germanDateToIso(form.date)
    const years = form.category !== null || form.years.trim() === '' ? undefined : Number(form.years)
    if (cents === null || date === null || form.label.trim() === '' || form.account.trim() === '' || (years !== undefined && !Number.isInteger(years))) return setInvalid(true)
    setInvalid(false)
    void run(
      () =>
        create.mutateAsync({
          jahr: taxYear,
          data: { label: form.label.trim(), account: form.account.trim(), acquisitionDate: date, acquisitionCostCents: cents, method: form.method, ...(form.category !== null ? { category: form.category } : {}), ...(years !== undefined ? { usefulLifeYears: years } : {}) },
          ...(params ? { params } : {}),
        }),
      () => {
        setAdding(false)
        setForm({ label: '', account: '', date: '', cost: '', method: 'linear', years: '', category: null })
      },
    )
  }

  function submitDisposal(id: string) {
    const date = germanDateToIso(disposalDate)
    const cents = proceeds.trim() === '' ? undefined : eurosToCents(proceeds)
    if (date === null || cents === null) return setInvalid(true)
    setInvalid(false)
    void run(
      () => dispose.mutateAsync({ jahr: taxYear, anlageId: id, data: { date, ...(cents !== undefined ? { proceedsCents: cents } : {}) }, ...(params ? { params } : {}) }),
      () => {
        setDisposing(null)
        setDisposalDate('')
        setProceeds('')
      },
    )
  }

  return (
    <BusinessFrame title={tr('business.seite.anlagen')} onBack={onBack} testID="anlagen-seite">
      {problem !== null ? <Note tone="error" testID="business-speichern-fehler">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      <Section>
        {rows.length === 0 ? <Note testID="anlagen-leer">{tr('business.anlagen.leer')}</Note> : null}
        {rows.map((row) => (
          <View key={row.id} style={{ paddingVertical: t.space.s2, borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }} testID={`anlage-${row.id}`}>
            <Figure label={row.label} value={plainCents(row.closingBookValue)} />
            <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('business.anlagen.anschaffung', { betrag: plainCents(row.acquisitionCost) })}</Text>
            {disposing === row.id ? (
              <View>
                <Feld label={tr('business.anlagen.abgangDatum')}>
                  <DateInput value={disposalDate} onChange={setDisposalDate} min={`${taxYear}-01-01`} max={`${taxYear}-12-31`} calendarLabel={tr('datum.kalender')} accessibilityLabel={tr('business.anlagen.abgangDatum')} testID="anlage-abgang-datum" />
                </Feld>
                <Feld label={tr('business.anlagen.erloes')}>
                  <Input type="numeric" mono value={proceeds} onChange={setProceeds} placeholder="0,00" accessibilityLabel={tr('business.anlagen.erloes')} testID="anlage-abgang-erloes" />
                </Feld>
                <Button onPress={() => submitDisposal(row.id)} testID="anlage-abgang-buchen">
                  {tr('business.anlagen.abgangSpeichern')}
                </Button>
              </View>
            ) : (
              <Button variant="ghost" onPress={() => setDisposing(row.id)} testID={`anlage-abgang-${row.id}`}>
                {tr('business.anlagen.abgang')}
              </Button>
            )}
          </View>
        ))}
        {rows.length > 0 ? <Figure strong label={tr('business.anlagen.summe')} value={plainCents(totalBook)} /> : null}
      </Section>
      {invalid ? <Note tone="error">{tr('business.anlagen.ungueltig')}</Note> : null}

      {adding ? (
        <Section title={tr('business.anlagen.neu')} testID="anlage-formular">
          <Feld label={tr('business.anlagen.bezeichnung')}>
            <Input value={form.label} onChange={(label) => setForm((f) => ({ ...f, label }))} accessibilityLabel={tr('business.anlagen.bezeichnung')} testID="anlage-bezeichnung" />
          </Feld>
          <Feld label={tr('business.anlagen.konto')}>
            <Input type="numeric" mono value={form.account} onChange={(account) => setForm((f) => ({ ...f, account }))} accessibilityLabel={tr('business.anlagen.konto')} testID="anlage-konto" />
          </Feld>
          <Feld label={tr('business.anlagen.datum')}>
            <DateInput value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} max={`${taxYear}-12-31`} calendarLabel={tr('datum.kalender')} accessibilityLabel={tr('business.anlagen.datum')} testID="anlage-datum" />
          </Feld>
          <Feld label={tr('business.anlagen.kosten')}>
            <Input type="numeric" mono value={form.cost} onChange={(cost) => setForm((f) => ({ ...f, cost }))} placeholder="1.200,00" accessibilityLabel={tr('business.anlagen.kosten')} testID="anlage-kosten" />
          </Feld>
          <Feld label={tr('business.anlagen.methode')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
              {METHODS.map((method) => (
                <Choice key={method} selected={form.method === method} onPress={() => setForm((f) => ({ ...f, method }))} testID={`anlage-methode-${method}`}>
                  {tr(`business.anlagen.methodeArt.${method}`)}
                </Choice>
              ))}
            </View>
          </Feld>
          {form.method === 'linear' || form.method === 'degressive' ? (
            <Feld label={tr('business.anlagen.art')}>
              <CatalogPicker
                value={form.category}
                options={categories.map((c) => ({ key: c.key, label: `${c.label} (${tr('business.anlagen.jahre', { count: c.years })})` }))}
                emptyLabel={tr('business.anlagen.eigeneDauer')}
                accessibilityLabel={tr('business.anlagen.art')}
                onChange={(key) => setForm((f) => ({ ...f, category: key as FixedAssetInputDtoCategory | null }))}
                testID="anlage-kategorie"
              />
            </Feld>
          ) : null}
          {(form.method === 'linear' || form.method === 'degressive') && form.category === null ? (
            <Feld label={tr('business.anlagen.nutzungsdauer')}>
              <Input type="numeric" mono value={form.years} onChange={(years) => setForm((f) => ({ ...f, years }))} placeholder="5" accessibilityLabel={tr('business.anlagen.nutzungsdauer')} testID="anlage-nutzungsdauer" />
            </Feld>
          ) : null}
          <Button onPress={submitAsset} testID="anlage-speichern">
            {tr('business.anlagen.speichern')}
          </Button>
        </Section>
      ) : (
        <Button variant="ghost" onPress={() => setAdding(true)} testID="anlage-neu">
          {tr('business.anlagen.neu')}
        </Button>
      )}

      <Button style={{ marginTop: t.space.s3 }} onPress={() => void run(() => depreciate.mutateAsync({ jahr: taxYear, ...(params ? { params } : {}) }))} testID="anlage-afa-buchen">
        {tr('business.anlagen.afaBuchen')}
      </Button>
    </BusinessFrame>
  )
}
