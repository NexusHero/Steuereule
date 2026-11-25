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
import { BusinessFrame, BusinessQueryState, Figure, Note, ProblemNote, Section } from './BusinessFrame'
import { eurosToCents, localProblem, personParams, plainEuro, signedEuro, type ApiProblem } from './businessKit'
import { parseGermanAmount } from '../shared/germanNumber'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

/** A stored euro amount as the field shows it (`1500,5`); empty when there is none. */
const germanNumber = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n).replace('.', ','))

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

  // The prepayments field edits the profile: the page waits for it too, so a failed read never shows an empty field (WEB-28).
  const loadProblem = queryProblem(query) ?? queryProblem(profile)
  if (query.isPending || profile.isPending || loadProblem !== null || query.data === undefined || profile.data === undefined) {
    return (
      <BusinessFrame title={tr('business.seite.umsatzsteuer')} onBack={onBack}>
        <BusinessQueryState
          pending={query.isPending || profile.isPending}
          problem={loadProblem}
          onRetry={() => {
            if (query.isError) void query.refetch()
            if (profile.isError) void profile.refetch()
          }}
        />
      </BusinessFrame>
    )
  }
  const vat = query.data.data
  const stored = profile.data.data.vatPrepaymentsCents
  const small = profile.data.data.smallBusiness

  async function commit() {
    if (prepayments === null) return
    setProblem(null)
    const cents = prepayments.trim() === '' ? null : eurosToCents(prepayments)
    if (prepayments.trim() !== '' && cents === null) return setProblem(localProblem(tr('business.erfassung.ungueltig')))
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
        {vat.result.inputVatCorrectionEur !== 0 ? <Figure label={tr('business.ust.berichtigung15a')} value={plainEuro(vat.result.inputVatCorrectionEur)} testID="ust-15a" /> : null}
        <Figure label={tr('business.ust.vorauszahlungen')} value={plainEuro(vat.result.prepaymentsEur)} />
        <Figure strong label={vat.result.balanceEur < 0 ? tr('business.ust.erstattung') : tr('business.ust.nachzahlung')} value={plainEuro(Math.abs(vat.result.balanceEur))} testID="ust-saldo" />
      </Section>
      {vat.inputVatCorrections.length > 0 ? (
        <Section title={tr('business.ust.berichtigung15aTitel')} testID="ust-15a-liste">
          <Note>{tr('business.ust.berichtigung15aHinweis')}</Note>
          {vat.inputVatCorrections.map((c) => (
            <Figure key={c.assetId} label={c.inPrepayment ? `${c.label} · ${tr('business.ust.berichtigung15aVa')}` : c.label} value={plainEuro(c.correctionEur)} />
          ))}
        </Section>
      ) : null}
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
        <ProblemNote problem={problem} />
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
  if (query.isPending || loadProblem !== null || query.data === undefined) {
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

  // WEB-30: the fields edit the profile's lossFacts; until the profile is loaded nothing is shown or sent.
  const loadProblem = queryProblem(query) ?? queryProblem(profile)
  if (query.isPending || profile.isPending || loadProblem !== null || query.data === undefined || profile.data === undefined) {
    return (
      <BusinessFrame title={tr('business.seite.verluste')} onBack={onBack}>
        <BusinessQueryState
          pending={query.isPending || profile.isPending}
          problem={loadProblem}
          onRetry={() => {
            if (query.isError) void query.refetch()
            if (profile.isError) void profile.refetch()
          }}
        />
      </BusinessFrame>
    )
  }
  const data = query.data.data
  const facts: LossFactsDto = profile.data.data.lossFacts
  const newLoss = data.year.newLossEur
  const waived = facts.waiveCarryBack === true

  /** Sends only the key that changed: the API merges lossFacts key by key (WEB-30, NC-15). */
  async function patch(next: LossFactsDto) {
    setProblem(null)
    const outcome = await attempt(() => save.mutateAsync({ jahr: taxYear, data: { lossFacts: next }, ...(params ? { params } : {}) }))
    if (outcome.ok) refresh()
    else setProblem(outcome.problem)
  }

  /** An entry of whole or decimal euros typed the German way; empty is 0; null (and a visible note) when it is no amount. */
  function amountOf(raw: string): number | null {
    if (raw.trim() === '') return 0
    const n = parseGermanAmount(raw)
    if (n === null) setProblem(localProblem(tr('business.erfassung.ungueltig')))
    return n
  }

  return (
    <BusinessFrame title={tr('business.seite.verluste')} onBack={onBack} testID="verluste-seite">
      <ProblemNote problem={problem} />
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
            value={carried ?? germanNumber(facts.carriedForwardEur)}
            onChange={setCarried}
            placeholder="0"
            accessibilityLabel={tr('business.verluste.vortragFeld')}
            onBlur={() => {
              if (carried === null) return
              const value = amountOf(carried)
              if (value !== null) void patch({ carriedForwardEur: value })
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
              value={room[i] ?? germanNumber(facts.roomEur?.[i])}
              onChange={(v) => setRoom((r) => ({ ...r, [i]: v }))}
              placeholder="0"
              accessibilityLabel={tr(i === 0 ? 'business.verluste.platzVorjahr' : 'business.verluste.platzJahrDavor')}
              onBlur={() => {
                const raw = room[i]
                if (raw === undefined) return
                const n = amountOf(raw)
                if (n === null) return
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
            value={room.back ?? germanNumber(facts.carriedBackEur)}
            onChange={(v) => setRoom((r) => ({ ...r, back: v }))}
            placeholder="0"
            accessibilityLabel={tr('business.verluste.zurueckgetragen')}
            onBlur={() => {
              if (room.back === undefined) return
              const n = amountOf(room.back)
              if (n !== null) void patch({ carriedBackEur: n })
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
