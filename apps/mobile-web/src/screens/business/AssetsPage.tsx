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
  useBusinessControllerSetAssetFacts,
  type FixedAssetInputDto,
  type FixedAssetInputDtoMethod,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { eurosToCents, personParams, plainCents, type ApiProblem } from './businessKit'
import { CatalogPicker } from './CatalogPicker'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

const METHODS: readonly FixedAssetInputDtoMethod[] = ['linear', 'degressive', 'elektrofahrzeug', 'gwg', 'sofort', 'building', 'building_degressive']
const isBuilding = (m: FixedAssetInputDtoMethod) => m === 'building' || m === 'building_degressive'
const EMPTY_FORM = {
  label: '',
  account: '',
  date: '',
  cost: '',
  method: 'linear' as FixedAssetInputDtoMethod,
  years: '',
  category: null as FixedAssetInputDtoCategory | null,
  use: 'betrieb' as 'betrieb' | 'wohnen',
  completed: '',
  applicationFiled: '',
  constructionStarted: '',
  contractSigned: '',
  special: '',
  priorProfit: '',
}
/** A percentage typed by the user as a share 0–1; null when it is no number in 0–100. */
const share = (raw: string): number | null => {
  const n = Number(raw.replace(',', '.'))
  return raw.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : null
}
const parseJson = <T,>(raw: string | null | undefined): T | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

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
  const setFacts = useBusinessControllerSetAssetFacts()
  const depreciate = useBusinessControllerBookDepreciation()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [adding, setAdding] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [correcting, setCorrecting] = useState<string | null>(null)
  const [correction, setCorrection] = useState({ vat: '', original: '100', thisYear: '' })
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
  const records = query.data.data.records
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
    const years = form.category !== null || form.years.trim() === '' || isBuilding(form.method) ? undefined : Number(form.years)
    const optionalDate = (raw: string) => (raw.trim() === '' ? undefined : (germanDateToIso(raw) ?? null))
    const completed = optionalDate(form.completed)
    const applicationFiled = optionalDate(form.applicationFiled)
    const constructionStarted = optionalDate(form.constructionStarted)
    const contractSigned = optionalDate(form.contractSigned)
    const special = form.special.trim() === '' ? undefined : eurosToCents(form.special)
    const priorProfit = form.priorProfit.trim() === '' ? undefined : eurosToCents(form.priorProfit)
    const badBuilding = isBuilding(form.method) && (completed === undefined || [completed, applicationFiled, constructionStarted, contractSigned].includes(null))
    if (cents === null || date === null || form.label.trim() === '' || form.account.trim() === '' || (years !== undefined && !Number.isInteger(years)) || badBuilding || special === null || priorProfit === null) return setInvalid(true)
    setInvalid(false)
    const data: FixedAssetInputDto = {
      label: form.label.trim(),
      account: form.account.trim(),
      acquisitionDate: date,
      acquisitionCostCents: cents,
      method: form.method,
      ...(form.category !== null && !isBuilding(form.method) ? { category: form.category } : {}),
      ...(years !== undefined ? { usefulLifeYears: years } : {}),
      ...(isBuilding(form.method)
        ? {
            building: {
              use: form.use,
              completed: completed!,
              ...(applicationFiled ? { applicationFiled } : {}),
              ...(constructionStarted ? { constructionStarted } : {}),
              ...(contractSigned ? { contractSigned } : {}),
            },
          }
        : {}),
      // § 7g Abs. 5 EStG: the Sonder-AfA of the acquisition year; later years on the asset's own line.
      ...(special !== undefined && special > 0
        ? { specialDepreciation: { byYear: { [date.slice(0, 4)]: special }, ...(priorProfit !== undefined ? { priorYearProfitEur: priorProfit / 100 } : {}) } }
        : {}),
    }
    void run(
      () => create.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) }),
      () => {
        setAdding(false)
        setForm(EMPTY_FORM)
      },
    )
  }

  /** § 15a UStG: the input VAT of the asset, the share deducted then and the one of this year. */
  function submitCorrection(id: string) {
    const vat = eurosToCents(correction.vat)
    const original = share(correction.original)
    const thisYear = share(correction.thisYear)
    if (vat === null || original === null || thisYear === null) return setInvalid(true)
    setInvalid(false)
    const known = parseJson<{ shareByYear?: Record<string, number> }>(records.find((r) => r.id === id)?.vatCorrection)
    void run(
      () =>
        setFacts.mutateAsync({
          jahr: taxYear,
          anlageId: id,
          data: { vatCorrection: { inputVatCents: vat, originalShare: original, shareByYear: { ...known?.shareByYear, [String(taxYear)]: thisYear } } },
          ...(params ? { params } : {}),
        }),
      () => {
        setCorrecting(null)
        setCorrection({ vat: '', original: '100', thisYear: '' })
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
            {correcting === row.id ? (
              <View testID="anlage-15a">
                <Note>{tr('business.anlagen.berichtigungHinweis')}</Note>
                <Feld label={tr('business.anlagen.vorsteuer')}>
                  <Input type="numeric" mono value={correction.vat} onChange={(vat) => setCorrection((c) => ({ ...c, vat }))} placeholder="0,00" accessibilityLabel={tr('business.anlagen.vorsteuer')} testID="anlage-15a-vorsteuer" />
                </Feld>
                <Feld label={tr('business.anlagen.anteilUrspruenglich')}>
                  <Input type="numeric" mono value={correction.original} onChange={(original) => setCorrection((c) => ({ ...c, original }))} placeholder="100" accessibilityLabel={tr('business.anlagen.anteilUrspruenglich')} testID="anlage-15a-ursprung" />
                </Feld>
                <Feld label={tr('business.anlagen.anteilJahr', { jahr: taxYear })}>
                  <Input type="numeric" mono value={correction.thisYear} onChange={(thisYear) => setCorrection((c) => ({ ...c, thisYear }))} placeholder="100" accessibilityLabel={tr('business.anlagen.anteilJahr', { jahr: taxYear })} testID="anlage-15a-jahr" />
                </Feld>
                <Button onPress={() => submitCorrection(row.id)} testID="anlage-15a-speichern">
                  {tr('business.anlagen.berichtigungSpeichern')}
                </Button>
              </View>
            ) : (
              <Button variant="ghost" onPress={() => setCorrecting(row.id)} testID={`anlage-15a-${row.id}`}>
                {tr('business.anlagen.berichtigung')}
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
          {isBuilding(form.method) ? (
            <View testID="anlage-gebaeude">
              <Feld label={tr('business.anlagen.nutzung')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
                  {(['betrieb', 'wohnen'] as const).map((use) => (
                    <Choice key={use} selected={form.use === use} onPress={() => setForm((f) => ({ ...f, use }))} testID={`anlage-nutzung-${use}`}>
                      {tr(`business.anlagen.nutzungArt.${use}`)}
                    </Choice>
                  ))}
                </View>
              </Feld>
              {(['completed', 'applicationFiled', ...(form.method === 'building_degressive' ? (['constructionStarted', 'contractSigned'] as const) : [])] as const).map((key) => (
                <Feld key={key} label={tr(`business.anlagen.gebaeudeDatum.${key}`)}>
                  <DateInput value={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} calendarLabel={tr('datum.kalender')} accessibilityLabel={tr(`business.anlagen.gebaeudeDatum.${key}`)} testID={`anlage-gebaeude-${key}`} />
                </Feld>
              ))}
            </View>
          ) : null}
          {form.method === 'linear' || form.method === 'degressive' ? (
            <View>
              <Feld label={tr('business.anlagen.sonderAfa')}>
                <Input type="numeric" mono value={form.special} onChange={(special) => setForm((f) => ({ ...f, special }))} placeholder="0,00" accessibilityLabel={tr('business.anlagen.sonderAfa')} testID="anlage-sonder-afa" />
              </Feld>
              {form.special.trim() !== '' ? (
                <Feld label={tr('business.anlagen.gewinnVorjahr')}>
                  <Input type="numeric" mono value={form.priorProfit} onChange={(priorProfit) => setForm((f) => ({ ...f, priorProfit }))} placeholder="0,00" accessibilityLabel={tr('business.anlagen.gewinnVorjahr')} testID="anlage-gewinn-vorjahr" />
                </Feld>
              ) : null}
            </View>
          ) : null}
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
