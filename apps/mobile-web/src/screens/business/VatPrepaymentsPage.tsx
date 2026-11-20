import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { useBusinessControllerVatPrepayments, type VatPeriodFactsDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { Choice } from './Choice'
import { personParams, plainEuro } from './businessKit'
import { queryProblem } from './useBusiness'
import { useProfileEditor } from './useProfileEditor'
import type { BusinessPageProps } from './BusinessScreen'

/** The order of the Kennzahlen as USt 1 A lists them. */
const KZ_ORDER = ['81', '86', '41', '21', '48', '89', '93', '46', '47', '84', '85', '66', '61', '67', '39', '83'] as const
const PERIODS = ['auto', 'monat', 'quartal', 'befreit'] as const

const dateDe = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

/**
 * The Umsatzsteuer-Voranmeldungen of the year (ADR-0101 §22): per period the Kennzahlen to type into
 * Mein ELSTER and the due date, the Sondervorauszahlung, and the Zusammenfassende Meldungen.
 */
export function VatPrepaymentsPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const query = useBusinessControllerVatPrepayments(taxYear, personParams(person, business))
  const editor = useProfileEditor(taxYear, person, business)
  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.voranmeldungen')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const va = query.data.data
  const facts: VatPeriodFactsDto = editor.profile?.vatPeriodFacts ?? {}
  const setFacts = (next: VatPeriodFactsDto) => void editor.save({ vatPeriodFacts: next })
  const chosen = facts.period ?? 'auto'
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.s2, marginBottom: t.space.s3 }

  return (
    <BusinessFrame title={tr('business.seite.voranmeldungen')} onBack={onBack} testID="voranmeldungen-seite">
      <Note>{tr('business.va.hinweis')}</Note>
      {editor.problem !== null ? <Note tone="error">{editor.problem.message ?? tr('business.speichernFehler')}</Note> : null}
      <Section title={tr('business.va.zeitraum')}>
        <Text style={{ ...t.type.body, color: t.color.tinte }} testID="va-zeitraum">
          {tr(`business.va.periode.${va.period}`)} · {tr(`business.va.quelle.${va.periodSource}`)}
        </Text>
        <View style={row}>
          {PERIODS.map((p) => (
            <Choice
              key={p}
              selected={chosen === p}
              onPress={() => {
                const { period: _old, ...rest } = facts
                setFacts(p === 'auto' ? rest : { ...rest, period: p })
              }}
              testID={`va-periode-${p}`}
            >
              {tr(`business.va.wahl.${p}`)}
            </Choice>
          ))}
        </View>
        <View style={row}>
          <Choice selected={va.extension} onPress={() => setFacts({ ...facts, extension: !va.extension })} testID="va-dauerfrist">
            {tr('business.va.dauerfrist')}
          </Choice>
        </View>
        {va.specialPrepaymentEur !== null ? <Figure label={tr('business.va.sondervorauszahlung')} value={plainEuro(va.specialPrepaymentEur)} testID="va-svz" /> : null}
      </Section>

      {va.period === 'befreit' ? <Note testID="va-befreit">{tr('business.va.befreitText')}</Note> : null}
      {va.periods.map((p) => (
        <Section key={p.label} title={`${p.label} · ${tr('business.va.faellig', { datum: dateDe(p.due) })}`} testID={`va-${p.label}`}>
          {KZ_ORDER.filter((kz) => p.kennzahlen[kz] !== undefined && kz !== '83').map((kz) => (
            <Figure key={kz} label={`Kz ${kz} · ${tr(`business.va.kz.${kz}`)}`} value={plainEuro(p.kennzahlen[kz]!)} />
          ))}
          <Figure strong label={p.vatDueEur < 0 ? tr('business.va.ueberschuss') : tr('business.va.zahllast')} value={plainEuro(Math.abs(p.vatDueEur))} testID={`va-${p.label}-83`} />
        </Section>
      ))}
      {va.periods.length > 0 ? <Figure strong label={tr('business.va.summe')} value={plainEuro(va.totalEur)} testID="va-summe" /> : null}

      <Section title={tr('business.va.zm')} testID="va-zm">
        {va.ecSalesList.reports.length === 0 ? <Note>{tr('business.va.zmKeine')}</Note> : null}
        {va.ecSalesList.reports.map((r) => (
          <View key={r.label} style={{ marginBottom: t.space.s3 }}>
            <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }}>{`${r.label} · ${tr('business.va.faellig', { datum: dateDe(r.due) })}`}</Text>
            {r.rows.map((x) => (
              <Figure key={x.vatId ?? 'ohne'} label={x.vatId ?? tr('business.va.ohneUstId')} value={plainEuro(x.goodsEur + x.servicesEur)} />
            ))}
            {r.rows.some((x) => x.vatId === null) ? <Note tone="warn">{tr('business.va.ustIdFehlt')}</Note> : null}
          </View>
        ))}
      </Section>
    </BusinessFrame>
  )
}
