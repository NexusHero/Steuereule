import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feld, Input, useTheme } from '@steuereule/ui'
import { View } from 'react-native'
import {
  useBusinessControllerLosses,
  useBusinessControllerProfile,
  useBusinessControllerSaveProfile,
  useBusinessControllerTradeTax,
  useBusinessControllerVat,
  type LossFactsDto,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, Section } from './BusinessFrame'
import { eurosToCents, personParams, plainEuro, signedEuro, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

/** The Umsatzsteuer-Jahreserklärung from the book; the prepayments are one sum the user enters. */
export function VatPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const query = useBusinessControllerVat(taxYear, params)
  const profile = useBusinessControllerProfile(taxYear, params)
  const save = useBusinessControllerSaveProfile()
  const refresh = useRefreshBusiness(taxYear)
  const [prepayments, setPrepayments] = useState<string | null>(null)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.umsatzsteuer')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const vat = query.data.data
  const stored = profile.data?.status === 200 ? profile.data.data.vatPrepaymentsCents : null
  const small = profile.data?.status === 200 && profile.data.data.smallBusiness

  async function commit() {
    if (prepayments === null) return
    setProblem(null)
    const cents = prepayments.trim() === '' ? null : eurosToCents(prepayments)
    if (prepayments.trim() !== '' && cents === null) return setProblem({ status: 0, code: null, message: tr('business.erfassung.ungueltig') })
    const outcome = await attempt(() => save.mutateAsync({ jahr: taxYear, data: { vatPrepaymentsCents: cents }, ...(params ? { params } : {}) }))
    if (outcome.ok) refresh()
    else setProblem(outcome.problem)
  }

  return (
    <BusinessFrame title={tr('business.seite.umsatzsteuer')} onBack={onBack} testID="umsatzsteuer-seite">
      {small ? <Note testID="ust-klein">{tr('business.ust.klein')}</Note> : null}
      {!vat.smallBusiness.matchesProfile ? (
        <Note tone="error" testID="ust-klein-grenze">
          {tr(vat.smallBusiness.foundingYear ? 'business.ust.kleinGrenzeGruendung' : vat.smallBusiness.crossed === 'prior_year' ? 'business.ust.kleinGrenzeVorjahr' : 'business.ust.kleinGrenzeJahr', {
            umsatz: plainEuro(vat.smallBusiness.turnoverEur),
            grenze: plainEuro(vat.smallBusiness.crossed === 'prior_year' ? vat.smallBusiness.priorYearLimitEur : vat.smallBusiness.currentYearLimitEur),
          })}
        </Note>
      ) : null}
      {vat.smallBusiness.taxedFrom ? (
        <Note tone="error" testID="ust-klein-ab">
          {tr('business.ust.kleinAb', { datum: `${vat.smallBusiness.taxedFrom.slice(8, 10)}.${vat.smallBusiness.taxedFrom.slice(5, 7)}.${vat.smallBusiness.taxedFrom.slice(0, 4)}` })}
        </Note>
      ) : null}
      {small && vat.smallBusiness.matchesProfile && !vat.smallBusiness.priorYearKnown ? <Note testID="ust-klein-vorjahr">{tr('business.ust.kleinVorjahrUnbekannt', { grenze: plainEuro(vat.smallBusiness.priorYearLimitEur) })}</Note> : null}
      <Section>
        <Figure label={tr('business.ust.umsatzsteuer')} value={plainEuro(vat.result.outputVat.standard)} />
        <Figure label={tr('business.ust.umsatzsteuerErmaessigt')} value={plainEuro(vat.result.outputVat.reduced)} />
        <Figure label={tr('business.ust.vorsteuer')} value={plainEuro(vat.result.inputVatDeductibleEur)} />
        <Figure label={tr('business.ust.jahr')} value={plainEuro(vat.result.vatOfYearEur)} />
        <Figure label={tr('business.ust.vorauszahlungen')} value={plainEuro(vat.result.prepaymentsEur)} />
        <Figure strong label={vat.result.balanceEur < 0 ? tr('business.ust.erstattung') : tr('business.ust.nachzahlung')} value={plainEuro(Math.abs(vat.result.balanceEur))} testID="ust-saldo" />
      </Section>
      <Section title={tr('business.ust.vorauszahlungenTitel')}>
        <Feld label={tr('business.ust.vorauszahlungenFeld')}>
          <Input
            type="numeric"
            mono
            value={prepayments ?? (stored === null || stored === undefined ? '' : String(stored / 100).replace('.', ','))}
            onChange={setPrepayments}
            placeholder="0,00"
            accessibilityLabel={tr('business.ust.vorauszahlungenFeld')}
            onBlur={() => void commit()}
            testID="ust-vorauszahlungen"
          />
        </Feld>
        {problem !== null ? <Note tone="error">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      </Section>
    </BusinessFrame>
  )
}

/** The Gewerbesteuer-Erklärung: calculated, open (what is missing), or not due (Freiberuf). */
export function TradeTaxPage({ taxYear, person, business = 1, onBack, onOpenPage }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const query = useBusinessControllerTradeTax(taxYear, personParams(person, business))
  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.gewerbesteuer')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const data = query.data.data
  const { status, result, multiplier } = data
  return (
    <BusinessFrame title={tr('business.seite.gewerbesteuer')} onBack={onBack} testID="gewerbesteuer-seite">
      {status === 'entfaellt' ? <Note testID="gewst-entfaellt">{tr('business.gewst.entfaellt')}</Note> : null}
      {status === 'offen' ? (
        <Section>
          <Text style={{ ...t.type.body, color: t.color.tinte }} testID="gewst-offen">
            {tr('business.gewst.offen')}
          </Text>
          <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('business.gewst.hebesatzFehlt')}</Text>
          <Text onPress={() => onOpenPage('profil')} accessibilityRole="link" style={{ ...t.type.body, color: t.color.tinte, textDecorationLine: 'underline', minHeight: 44 }} testID="gewst-zum-profil">
            {tr('business.gewst.zumProfil')}
          </Text>
        </Section>
      ) : null}
      {status === 'berechnet' && result !== undefined ? (
        <Section testID="gewst-kette">
          {/* The chain from the profit to the tax: every step the Finanzamt takes, in its order. */}
          <Figure label={tr('business.gewst.gewinn')} value={plainEuro(data.profitEur ?? result.tradeIncomeBeforeLossEur - result.additionsEur + result.deductionsEur)} testID="gewst-gewinn" />
          <Figure label={tr('business.gewst.hinzurechnung')} value={plainEuro(result.additionsEur)} />
          <Figure label={tr('business.gewst.kuerzung')} value={plainEuro(result.deductionsEur)} />
          {result.lossUsedEur > 0 ? <Figure label={tr('business.gewst.fehlbetrag')} value={plainEuro(result.lossUsedEur)} testID="gewst-fehlbetrag" /> : null}
          <Figure label={tr('business.gewst.gewerbeertrag')} value={plainEuro(result.roundedTradeIncomeEur)} testID="gewst-gewerbeertrag" />
          <Figure label={tr('business.gewst.freibetrag')} value={plainEuro(result.allowanceEur)} />
          <Figure label={tr('business.gewst.messbetrag')} value={plainEuro(result.baseAmountEur)} />
          <Figure label={tr('business.gewst.hebesatz')} value={`${result.multiplierPercent} %`} />
          <Figure strong label={tr('business.gewst.steuer')} value={plainEuro(result.tradeTaxEur)} testID="gewst-steuer" />
          {result.lossRemainingEur > 0 ? <Note testID="gewst-fehlbetrag-rest">{tr('business.gewst.fehlbetragRest', { betrag: plainEuro(result.lossRemainingEur) })}</Note> : null}
          {multiplier !== undefined ? (
            <Note>{multiplier.source === 'korrektur' ? tr('business.gewst.hebesatzKorrigiert') : tr('business.gewst.hebesatzTabelle', { jahr: multiplier.tableYear ?? '' })}</Note>
          ) : null}
        </Section>
      ) : null}
    </BusinessFrame>
  )
}

/** Verluste (§ 10d): the carry-forward used, a new loss and its carry-back; the waiver only as a whole. */
export function LossesPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const { t: tr } = useTranslation(APP_NS)
  const t = useTheme()
  const params = personParams(person, business)
  const query = useBusinessControllerLosses(taxYear, params)
  const profile = useBusinessControllerProfile(taxYear, params)
  const save = useBusinessControllerSaveProfile()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [carried, setCarried] = useState<string | null>(null)
  const [room, setRoom] = useState<Readonly<Record<string, string>>>({})

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.verluste')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const data = query.data.data
  const facts: LossFactsDto = profile.data?.status === 200 ? profile.data.data.lossFacts : {}
  const newLoss = data.year.newLossEur
  const waived = facts.waiveCarryBack === true

  async function patch(next: LossFactsDto) {
    setProblem(null)
    const outcome = await attempt(() => save.mutateAsync({ jahr: taxYear, data: { lossFacts: { ...facts, ...next } satisfies LossFactsDto }, ...(params ? { params } : {}) }))
    if (outcome.ok) refresh()
    else setProblem(outcome.problem)
  }

  return (
    <BusinessFrame title={tr('business.seite.verluste')} onBack={onBack} testID="verluste-seite">
      {problem !== null ? <Note tone="error">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      <Section>
        <Figure label={tr('business.verluste.gewinn')} value={signedEuro(data.businessProfitEur)} />
        <Figure label={tr('business.verluste.vortragGenutzt')} value={plainEuro(data.year.carryForwardDeductedEur)} />
        <Figure label={tr('business.verluste.neuerVerlust')} value={plainEuro(data.year.newLossEur)} testID="verluste-neu" />
        <Figure strong label={tr('business.verluste.vortragRest')} value={plainEuro(data.year.remainingCarryForwardEur)} />
      </Section>
      <Section title={tr('business.verluste.vortragTitel')}>
        <Feld label={tr('business.verluste.vortragFeld')}>
          <Input
            type="numeric"
            mono
            value={carried ?? String(facts.carriedForwardEur ?? '')}
            onChange={setCarried}
            placeholder="0"
            accessibilityLabel={tr('business.verluste.vortragFeld')}
            onBlur={() => {
              if (carried === null) return
              const value = Number(carried.replace(',', '.'))
              if (carried.trim() === '' || Number.isFinite(value)) void patch({ carriedForwardEur: carried.trim() === '' ? 0 : value })
            }}
            testID="verluste-vortrag"
          />
        </Feld>
      </Section>
      <Section title={tr('business.verluste.weitereTitel')}>
        {([0, 1] as const).map((i) => (
          <Feld key={i} label={tr(i === 0 ? 'business.verluste.platzVorjahr' : 'business.verluste.platzJahrDavor')}>
            <Input
              type="numeric"
              mono
              value={room[i] ?? String(facts.roomEur?.[i] ?? '')}
              onChange={(v) => setRoom((r) => ({ ...r, [i]: v }))}
              placeholder="0"
              accessibilityLabel={tr(i === 0 ? 'business.verluste.platzVorjahr' : 'business.verluste.platzJahrDavor')}
              onBlur={() => {
                const raw = room[i]
                if (raw === undefined) return
                const n = raw.trim() === '' ? 0 : Number(raw.replace(',', '.'))
                if (!Number.isFinite(n)) return
                const next: number[] = [facts.roomEur?.[0] ?? 0, facts.roomEur?.[1] ?? 0]
                next[i] = n
                void patch({ roomEur: next })
              }}
              testID={`verluste-platz-${i}`}
            />
          </Feld>
        ))}
        <Feld label={tr('business.verluste.zurueckgetragen')}>
          <Input
            type="numeric"
            mono
            value={room.back ?? String(facts.carriedBackEur ?? '')}
            onChange={(v) => setRoom((r) => ({ ...r, back: v }))}
            placeholder="0"
            accessibilityLabel={tr('business.verluste.zurueckgetragen')}
            onBlur={() => {
              if (room.back === undefined) return
              const n = room.back.trim() === '' ? 0 : Number(room.back.replace(',', '.'))
              if (Number.isFinite(n)) void patch({ carriedBackEur: n })
            }}
            testID="verluste-zurueckgetragen"
          />
        </Feld>
      </Section>
      {newLoss > 0 ? (
        <Section title={tr('business.verluste.ruecktragTitel')} testID="verluste-ruecktrag">
          <Figure label={tr('business.verluste.jahrDavor')} value={plainEuro(data.carryBack?.intoYearBeforeEur ?? 0)} />
          <Figure label={tr('business.verluste.zweitesJahrDavor')} value={plainEuro(data.carryBack?.intoSecondYearBeforeEur ?? 0)} />
          <Note>{tr('business.verluste.nurGanz')}</Note>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            <Choice selected={!waived} onPress={() => void patch({ waiveCarryBack: false })} testID="verluste-ruecktrag-ja">
              {tr('business.verluste.ruecktragNehmen')}
            </Choice>
            <Choice selected={waived} onPress={() => void patch({ waiveCarryBack: true })} testID="verluste-ruecktrag-verzicht">
              {tr('business.verluste.ruecktragVerzicht')}
            </Choice>
          </View>
        </Section>
      ) : null}
    </BusinessFrame>
  )
}
