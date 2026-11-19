import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { CapitalYearDto, CrossBorderGroupDto, PensionGroupDto, PrepaymentSeriesDto, RentalGroupPropertyDto, YearHistoryResponseDto } from '@steuereule/api-client'
import { formatEuro } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { HistoryChart } from './HistoryChart'
import { buildAmountChart, type ChartModel } from './historyChartModel'
import { germanDate, joinList, percent, signedEuro, signedPercent } from './historyFormat'
import type { HistoryGroupTab } from './historyInsights'
import { historyStyles } from './historyStyles'

/**
 * The group tabs of „Entwicklung“ (ADR-0099 §3, §7, mock ideas 3, Grenzgänger, Vermieter, Kapital,
 * Rentner): each one only with data, from the household's own Bescheide and answers, no forecast. Every
 * chart keeps its numbers in a data table; what the app does not record yet says „noch nicht erfasst“.
 */
export function HistoryGroupPanel({ data, tab }: { readonly data: YearHistoryResponseDto; readonly tab: HistoryGroupTab }) {
  switch (tab) {
    case 'vorauszahlungen':
      return <PrepaymentPanel series={data.prepayments} />
    case 'schweiz':
      return data.groups.crossBorder ? <CrossBorderPanel group={data.groups.crossBorder} /> : null
    case 'vermietung':
      return data.groups.rental ? <RentalPanel properties={data.groups.rental.properties} /> : null
    case 'kapital':
      return data.groups.capital ? <CapitalPanel years={data.groups.capital.years} /> : null
    case 'rente':
      return data.groups.pension ? <PensionPanel group={data.groups.pension} /> : null
  }
}

const rate = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const whole = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 })

function Card({ title, sub, children, testID }: { readonly title: string; readonly sub?: string | undefined; readonly children: ReactNode; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  return (
    <View style={s.card} testID={testID}>
      <Text style={s.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
      {children}
    </View>
  )
}

function Line({ label, value, testID }: { readonly label: string; readonly value: string; readonly testID?: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  return (
    <View style={s.line} testID={testID}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={s.lineValue}>{value}</Text>
    </View>
  )
}

function Chart({ model, title, testID }: { readonly model: ChartModel; readonly title: string; readonly testID: string }) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const [selected, setSelected] = useState<number | null>(null)
  const years = model.columns.map((c) => c.year)
  const range = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : ''
  return <HistoryChart model={model} selectedYear={selected} onSelectYear={setSelected} accessibilityLabel={tr('verlauf.chart.a11y', { titel: title, zeitraum: range })} height={bp === 's' ? 190 : 220} testID={testID} />
}

/** The numbers behind a tab as a table, behind the same toggle as the key figures' table. */
function GroupTable({ title, heads, rows, testID }: { readonly title: string; readonly heads: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  return (
    <View style={s.tableWrap}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={s.tableToggle} testID={`${testID}-umschalten`}>
        <Text style={s.link}>{open ? `▾ ${tr('verlauf.datentabelle.zu')}` : `▸ ${tr('verlauf.datentabelle.auf')}`}</Text>
      </Pressable>
      {open ? (
        <ScrollView horizontal>
          <View role="table" accessibilityLabel={tr('verlauf.datentabelle.a11y', { titel: title })} testID={testID}>
            <View role="row" style={s.dataRow}>
              {heads.map((h) => (
                <Text key={h} role="columnheader" style={[s.dataCell, s.dataHead]}>
                  {h}
                </Text>
              ))}
            </View>
            {rows.map((r, i) => (
              <View key={`${r[0]}-${i}`} role="row" style={s.dataRow}>
                {r.map((c, j) => (
                  <Text key={heads[j]} role={j === 0 ? 'rowheader' : 'cell'} style={s.dataCell}>
                    {c}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  )
}

/** ADR-0099 §3: the Abschlusszahlung per year; after back payments the hint to have the prepayments adjusted. */
function PrepaymentPanel({ series }: { readonly series: PrepaymentSeriesDto }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const title = tr('verlauf.gruppe.vorauszahlungen.titel')
  const model = buildAmountChart(series.years.map((y) => ({ year: y.year, value: y.refund })))
  const count = series.consecutiveBackPayments > 0 ? series.consecutiveBackPayments : series.backPaymentYears
  const adjust = series.years.some((y) => y.adjustPrepayments)
  return (
    <Card title={title} sub={tr('verlauf.gruppe.vorauszahlungen.sub')} testID="verlauf-gruppe-vorauszahlungen">
      <Chart model={model} title={title} testID="verlauf-gruppe-diagramm" />
      {series.averageBackPayment !== null && count > 0 ? (
        <Text style={s.hint} testID="verlauf-gruppe-vorauszahlungen-hinweis">
          {[tr('verlauf.gruppe.vorauszahlungen.serie', { count, betrag: formatEuro(Math.round(series.averageBackPayment)) }), adjust ? tr('verlauf.gruppe.vorauszahlungen.anpassen') : null].filter(Boolean).join(' ')}
        </Text>
      ) : null}
      <GroupTable
        title={title}
        heads={[tr('verlauf.tabelle.jahr'), tr('verlauf.gruppe.vorauszahlungen.abschluss'), tr('verlauf.gruppe.vorauszahlungen.vorauszahlungen')]}
        rows={series.years.map((y) => [String(y.year), signedEuro(y.refund), y.prepayments === null ? '–' : formatEuro(y.prepayments)])}
        testID="verlauf-gruppe-tabelle"
      />
    </Card>
  )
}

/** Grenzgänger (ADR-0099 §7): the rate and the wage in euros, the credited Quellensteuer, the Swiss share of the income. */
function CrossBorderPanel({ group }: { readonly group: CrossBorderGroupDto }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const two = new Set(group.years.map((y) => y.person)).size > 1
  const who = (text: string, person: 'A' | 'B' | null) => (two && person ? tr('verlauf.unterlagen.personSuffix', { was: text, person: tr(`verlauf.person.${person}`) }) : text)
  const qstTitle = tr('verlauf.gruppe.schweiz.qstTitel')
  const credited = [...new Set(group.years.map((y) => y.year))].map((year) => ({ year, value: group.years.filter((y) => y.year === year).reduce((n, y) => n + y.creditedEur, 0) }))
  const latest = credited[credited.length - 1]
  return (
    <View style={s.section} testID="verlauf-gruppe-schweiz">
      <Card title={tr('verlauf.gruppe.schweiz.kursTitel')} testID="verlauf-gruppe-schweiz-kurs">
        {group.years.map((y) => (
          <View key={`${y.year}-${y.person}`} style={s.entry}>
            <Line label={who(String(y.year), y.person)} value={tr('verlauf.gruppe.schweiz.kursZeile', { kurs: rate(y.rate), chf: whole(y.grossChf), eur: formatEuro(Math.round(y.grossEur)) })} />
            {y.rateChangePercent !== null ? <Text style={s.muted}>{tr('verlauf.gruppe.schweiz.kursAenderung', { prozent: signedPercent(y.rateChangePercent) })}</Text> : null}
          </View>
        ))}
      </Card>
      <Card title={qstTitle} testID="verlauf-gruppe-schweiz-quellensteuer">
        <Chart model={buildAmountChart(credited, 'bar')} title={qstTitle} testID="verlauf-gruppe-diagramm" />
        {latest ? <Text style={s.muted}>{tr('verlauf.gruppe.schweiz.qstText', { jahr: latest.year, betrag: formatEuro(Math.round(latest.value)) })}</Text> : null}
        {group.years
          .filter((y) => y.creditCapped)
          .map((y) => (
            <Text key={`cap-${y.year}-${y.person}`} style={s.hint}>
              {who(tr('verlauf.gruppe.schweiz.gekappt', { jahr: y.year, chf: whole(y.withholdingTaxChf) }), y.person)}
            </Text>
          ))}
      </Card>
      {group.swissShare.length > 0 ? (
        <Card title={tr('verlauf.gruppe.schweiz.anteilTitel')} testID="verlauf-gruppe-schweiz-anteil">
          <Text style={s.body}>{group.swissShare.map((y) => tr('verlauf.gruppe.schweiz.anteilZeile', { jahr: y.year, prozent: percent(y.percent) })).join(' · ')}</Text>
        </Card>
      ) : null}
      <GroupTable
        title={tr('verlauf.gruppe.tab.schweiz')}
        heads={[
          tr('verlauf.tabelle.jahr'),
          tr('verlauf.gruppe.schweiz.person'),
          tr('verlauf.gruppe.schweiz.kurs'),
          tr('verlauf.gruppe.schweiz.lohnChf'),
          tr('verlauf.gruppe.schweiz.lohnEur'),
          tr('verlauf.gruppe.schweiz.qstChf'),
          tr('verlauf.gruppe.schweiz.angerechnet'),
        ]}
        rows={group.years.map((y) => [String(y.year), tr(`verlauf.person.${y.person ?? 'A'}`), rate(y.rate), whole(y.grossChf), whole(y.grossEur), whole(y.withholdingTaxChf), whole(y.creditedEur)])}
        testID="verlauf-gruppe-tabelle"
      />
    </View>
  )
}

/** Vermieter (ADR-0099 §7): the result per property and year, the AfA with its book value, the 15 % window after the purchase. */
function RentalPanel({ properties }: { readonly properties: readonly RentalGroupPropertyDto[] }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={s.section} testID="verlauf-gruppe-vermietung">
      {properties.map((p, i) => {
        const name = p.label ?? tr('verlauf.gruppe.vermietung.objekt', { nummer: i + 1 })
        const title = `${name} · ${tr('verlauf.gruppe.vermietung.ergebnisTitel')}`
        const window = p.acquisitionRelated
        const open = p.years.filter((y) => y.result === null)
        return (
          <Card key={p.propertyKey} title={title} testID={`verlauf-gruppe-objekt-${i}`}>
            <Chart model={buildAmountChart(p.years.map((y) => ({ year: y.year, value: y.result })))} title={title} testID="verlauf-gruppe-diagramm" />
            {open.length > 0 ? <Text style={s.muted}>{open.map((y) => tr('verlauf.gruppe.vermietung.ergebnisOffen', { jahr: y.year })).join(' · ')}</Text> : null}
            <Text style={s.strong}>{tr('verlauf.gruppe.vermietung.afaTitel')}</Text>
            {p.depreciation ? (
              <Text style={s.body}>
                {[
                  tr('verlauf.gruppe.vermietung.afaZeile', { betrag: formatEuro(Math.round(p.depreciation.annual)), satz: percent(p.depreciation.ratePercent) }),
                  p.bookValue !== null ? tr('verlauf.gruppe.vermietung.restwert', { betrag: formatEuro(Math.round(p.bookValue)) }) : null,
                  p.yearsLeft !== null ? tr('verlauf.gruppe.vermietung.restjahre', { count: p.yearsLeft }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : (
              <Text style={s.muted}>{tr('verlauf.gruppe.vermietung.afaOffen')}</Text>
            )}
            <Text style={s.strong}>{tr('verlauf.gruppe.vermietung.grenzeTitel')}</Text>
            {window ? (
              <View style={s.entry} testID={`verlauf-gruppe-objekt-${i}-grenze`}>
                <Text style={window.exceeds ? s.hintBad : s.hint}>
                  {tr(window.exceeds ? 'verlauf.gruppe.vermietung.grenzeUeber' : window.windowOpen ? 'verlauf.gruppe.vermietung.grenzeOffen' : 'verlauf.gruppe.vermietung.grenzeVorbei', {
                    ende: germanDate(window.windowEnd),
                    grenze: formatEuro(Math.round(window.limitEur)),
                    bisher: formatEuro(Math.round(window.withinWindowEur)),
                  })}
                </Text>
                {window.undatedCounted > 0 ? <Text style={s.muted}>{tr('verlauf.gruppe.vermietung.ohneDatum', { count: window.undatedCounted })}</Text> : null}
              </View>
            ) : (
              <Text style={s.muted}>{tr('verlauf.gruppe.vermietung.kaufOffen')}</Text>
            )}
            <GroupTable
              title={title}
              heads={[tr('verlauf.tabelle.jahr'), tr('verlauf.gruppe.vermietung.ergebnis'), tr('verlauf.gruppe.vermietung.afa'), tr('verlauf.gruppe.vermietung.restwertSpalte')]}
              rows={p.years.map((y) => [String(y.year), y.result === null ? '–' : signedEuro(y.result), y.depreciation === null ? '–' : formatEuro(Math.round(y.depreciation)), y.bookValueEnd === null ? '–' : formatEuro(Math.round(y.bookValueEnd))])}
              testID={i === 0 ? 'verlauf-gruppe-tabelle' : `verlauf-gruppe-tabelle-${i}`}
            />
          </Card>
        )
      })}
      <Text style={s.muted} testID="verlauf-gruppe-verlustvortrag">
        {tr('verlauf.gruppe.vermietung.verlustvortrag')}
      </Text>
    </View>
  )
}

function favourableText(y: CapitalYearDto, tr: TFunction): string {
  const check = y.favourableCheck
  if (check === null) return tr('verlauf.gruppe.kapital.guenstigerOhne', { jahr: y.year })
  if (check.statement !== 'eindeutig') return tr('verlauf.gruppe.kapital.guenstigerKnapp', { jahr: y.year })
  if (check.recommendation === 'persoenlich' && check.delta > 0) return tr('verlauf.gruppe.kapital.guenstigerJa', { jahr: y.year, betrag: formatEuro(Math.round(check.delta)) })
  return tr('verlauf.gruppe.kapital.guenstigerNein', { jahr: y.year })
}

/** Kapital (ADR-0099 §7): how much of the Sparer-Pauschbetrag was used, and what the Günstigerprüfung would have brought. */
function CapitalPanel({ years }: { readonly years: readonly CapitalYearDto[] }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const title = tr('verlauf.gruppe.kapital.titel')
  return (
    <View style={s.section} testID="verlauf-gruppe-kapital">
      <Card title={title} testID="verlauf-gruppe-kapital-pauschbetrag">
        {years.map((y) => (
          <View key={y.year} style={s.entry}>
            <Line label={String(y.year)} value={tr('verlauf.gruppe.kapital.zeile', { genutzt: whole(y.allowanceUsed), grenze: formatEuro(y.allowanceLimit) })} />
            <Text style={s.muted}>
              {y.fullyUsed ? tr('verlauf.gruppe.kapital.voll', { betrag: formatEuro(Math.round(y.aboveAllowance)) }) : tr('verlauf.gruppe.kapital.frei', { betrag: formatEuro(Math.round(y.allowanceLimit - y.allowanceUsed)) })}
            </Text>
          </View>
        ))}
        <Text style={s.muted}>{tr('verlauf.gruppe.kapital.toepfe')}</Text>
      </Card>
      <Card title={tr('verlauf.gruppe.kapital.guenstigerTitel')} testID="verlauf-gruppe-kapital-guenstiger">
        <Text style={s.body}>{years.map((y) => favourableText(y, tr)).join(' ')}</Text>
      </Card>
      <GroupTable
        title={title}
        heads={[tr('verlauf.tabelle.jahr'), tr('verlauf.gruppe.kapital.ertraege'), tr('verlauf.gruppe.kapital.genutzt'), tr('verlauf.gruppe.kapital.darueber'), tr('verlauf.gruppe.kapital.guenstigerTitel')]}
        rows={years.map((y) => [
          String(y.year),
          formatEuro(Math.round(y.income)),
          formatEuro(Math.round(y.allowanceUsed)),
          formatEuro(Math.round(y.aboveAllowance)),
          y.favourableCheck === null ? '–' : y.favourableCheck.recommendation === 'persoenlich' ? formatEuro(Math.round(y.favourableCheck.delta)) : formatEuro(0),
        ])}
        testID="verlauf-gruppe-tabelle"
      />
    </View>
  )
}

/** Rentner (ADR-0099 §7): the pension and its taxable part, the Besteuerungsanteil and the fixed Rentenfreibetrag. */
function PensionPanel({ group }: { readonly group: PensionGroupDto }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const title = tr('verlauf.gruppe.rente.titel')
  const facts = [
    group.sharePercent !== null && group.startYear !== null ? tr('verlauf.gruppe.rente.anteil', { prozent: percent(group.sharePercent), jahr: group.startYear }) : null,
    group.allowance !== null && group.allowanceYear !== null ? tr('verlauf.gruppe.rente.freibetrag', { betrag: formatEuro(Math.round(group.allowance)), jahr: group.allowanceYear }) : null,
  ].filter((f): f is string => f !== null)
  return (
    <View style={s.section} testID="verlauf-gruppe-rente">
      <Card title={title} testID="verlauf-gruppe-rente-jahre">
        {facts.length > 0 ? <Text style={s.body}>{joinList(facts, tr)}</Text> : null}
        {group.years.map((y) => (
          <Line
            key={y.year}
            label={String(y.year)}
            value={[y.amount === null ? tr('verlauf.nochOffenKurz') : formatEuro(Math.round(y.amount)), y.taxablePart === null ? null : tr('verlauf.gruppe.rente.zeile', { betrag: formatEuro(Math.round(y.taxablePart)) })].filter(Boolean).join(' · ')}
          />
        ))}
        <Text style={s.owlText}>{tr('verlauf.gruppe.rente.warum')}</Text>
      </Card>
      <GroupTable
        title={title}
        heads={[tr('verlauf.tabelle.jahr'), tr('verlauf.gruppe.rente.rente'), tr('verlauf.gruppe.rente.steuerpflichtig')]}
        rows={group.years.map((y) => [String(y.year), y.amount === null ? '–' : formatEuro(Math.round(y.amount)), y.taxablePart === null ? '–' : formatEuro(Math.round(y.taxablePart))])}
        testID="verlauf-gruppe-tabelle"
      />
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const section: ViewStyle = { gap: t.space.s3 }
  const entry: ViewStyle = { gap: 2 }
  const hintBad: TextStyle = { ...base.hint, backgroundColor: t.color.fehlerWeich }
  const tableWrap: ViewStyle = { gap: t.space.s2 }
  const tableToggle: ViewStyle = { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }
  const link: TextStyle = { ...t.type.small, color: t.color.kiTinte }
  const dataRow: ViewStyle = { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }
  const dataCell: TextStyle = { ...t.type.meta, color: t.color.tinte, width: 112, paddingHorizontal: t.space.s2, paddingVertical: 6, fontVariant: ['tabular-nums'] }
  const dataHead: TextStyle = { color: t.color.tinte2, fontWeight: t.weight.schwer }
  return { ...base, section, entry, hintBad, tableWrap, tableToggle, link, dataRow, dataCell, dataHead }
}
