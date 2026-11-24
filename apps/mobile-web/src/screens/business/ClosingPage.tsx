import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { useBusinessControllerCarryForward, useBusinessControllerClosing } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, ProblemNote, Section } from './BusinessFrame'
import { personParams, plainCents, signedCents, signedEuro, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness, useSingleFlight } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

/** The year's result: EÜR totals and profit, or GuV and Bilanz with the opening balance carried into the next year. */
export function ClosingPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const query = useBusinessControllerClosing(taxYear, params)
  const carry = useBusinessControllerCarryForward()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const flight = useSingleFlight()
  const [carried, setCarried] = useState(false)

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data === undefined) {
    return (
      <BusinessFrame title={tr('business.seite.abschluss')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const sheet = query.data.data
  const broken = !sheet.integrity.ok
  const euer = sheet.mode === 'euer'

  async function carryForward() {
    setProblem(null)
    const outcome = await attempt(() => carry.mutateAsync({ jahr: taxYear, ...(params ? { params } : {}) }))
    if (outcome.ok) {
      setCarried(true)
      refresh()
    } else setProblem(outcome.problem)
  }

  const profitEur = sheet.euer?.profit.profitEur ?? null

  return (
    <BusinessFrame title={tr('business.seite.abschluss')} onBack={onBack} testID="abschluss-seite">
      {broken ? (
        <Section>
          <Text style={{ ...t.type.bodyStrong, color: t.color.fehler }} accessibilityRole="alert" testID="buch-integritaet-fehler">
            {tr('business.buch.kette')}
          </Text>
          {sheet.integrity.reason ? <Text style={{ ...t.type.body, color: t.color.tinte }}>{sheet.integrity.reason}</Text> : null}
        </Section>
      ) : null}
      {euer ? (
        <Section title={tr('business.abschluss.euer')}>
          <Figure label={tr('business.erfassung.einnahmen')} value={plainCents(sheet.euer?.totals.einnahmen ?? 0)} />
          <Figure label={tr('business.erfassung.ausgaben')} value={plainCents(sheet.euer?.totals.ausgaben ?? 0)} />
          <Figure strong label={tr('business.abschluss.gewinn')} value={profitEur === null ? '–' : signedEuro(profitEur)} testID="abschluss-gewinn" />
        </Section>
      ) : (
        <>
          <Section title={tr('business.abschluss.guv')}>
            <Figure strong label={tr('business.abschluss.jahresergebnis')} value={signedCents(sheet.bilanz?.incomeStatement.profit ?? 0)} testID="abschluss-gewinn" />
          </Section>
          <Section title={tr('business.abschluss.bilanz')}>
            <Figure label={tr('business.abschluss.aktiva')} value={plainCents(sheet.bilanz?.balanceSheet.totalAktiva ?? 0)} testID="abschluss-aktiva" />
            <Figure label={tr('business.abschluss.passiva')} value={plainCents(sheet.bilanz?.balanceSheet.totalPassiva ?? 0)} testID="abschluss-passiva" />
          </Section>
          <ProblemNote problem={problem} testID="business-speichern-fehler" />
          {carried ? <Note testID="abschluss-uebertragen">{tr('business.abschluss.uebertragen', { year: taxYear + 1 })}</Note> : null}
          <Button disabled={broken || flight.busy} onPress={() => void flight.run(carryForward)} testID="abschluss-eroeffnung">
            {tr('business.abschluss.uebertragenButton', { year: taxYear + 1 })}
          </Button>
        </>
      )}
    </BusinessFrame>
  )
}
