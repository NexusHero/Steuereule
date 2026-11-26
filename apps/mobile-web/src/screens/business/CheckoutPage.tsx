import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { useBusinessControllerCheckout, useUnlockControllerStatus } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, Note, ProblemNote, Section } from './BusinessFrame'
import type { ApiProblem } from './businessKit'
import { attempt, useSingleFlight } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'
import { checkoutRefusalOf, priceText } from '../shared/usePaymentConfirmation'
import { LegalLinks } from '../legal/LegalLinks'
import { BetaNotice } from '../shared/BetaNotice'

/** Unlocking the year at the self-employment tier (ADR-0101 §21): fill-in help and exports are part of it. */
export function CheckoutPage({ taxYear, onBack, onOpenPage, openCheckout = (url) => window.location.assign(url) }: BusinessPageProps & { readonly openCheckout?: (url: string) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const checkout = useBusinessControllerCheckout()
  const status = useUnlockControllerStatus(taxYear)
  // WEB-16: the price the checkout charges, from the same Stripe price, before the redirect.
  const price = priceText(status.data?.data.price ?? null)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  // API-4: one checkout per tap, not one per double tap.
  const flight = useSingleFlight()
  const refusal = problem === null ? null : checkoutRefusalOf(problem.error)

  async function pay() {
    setProblem(null)
    const result = await attempt(() => checkout.mutateAsync({ jahr: taxYear }))
    if (result.ok) openCheckout((result.response.data as { checkoutUrl: string }).checkoutUrl)
    else setProblem(result.problem)
  }

  return (
    <BusinessFrame title={tr('business.seite.freischalten')} onBack={onBack} testID="freischalten-seite">
      <Section>
        <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.freischalten.text', { year: taxYear })}</Text>
        <Note testID="checkout-preis">{price ? tr('zahlung.preis', { preis: price, year: taxYear }) : tr('zahlung.preisUnbekannt')}</Note>
        {refusal === 'already-paid' ? (
          <>
            <Note testID="checkout-schon-bezahlt">{tr('zahlung.schonBezahlt', { year: taxYear })}</Note>
            <Button variant="ghost" onPress={() => onOpenPage('elster')} testID="checkout-zur-ausfuellhilfe">
              {tr('business.seite.elster')}
            </Button>
          </>
        ) : refusal === 'pending' ? (
          <Note testID="checkout-ausstehend">{tr('zahlung.ausstehend', { year: taxYear })}</Note>
        ) : refusal === 'throttled' ? (
          <Note tone="error" testID="checkout-zu-viele">
            {tr('zahlung.zuVieleVersuche')}
          </Note>
        ) : refusal === 'not-configured' ? (
          <Note tone="error" testID="checkout-nicht-eingerichtet">
            {tr('business.freischalten.nichtEingerichtet')}
          </Note>
        ) : problem !== null ? (
          <ProblemNote problem={problem} testID="business-speichern-fehler" />
        ) : null}
        <Button onPress={() => void flight.run(pay)} disabled={flight.busy || refusal === 'already-paid'} testID="checkout-selbststaendig">
          {tr('business.freischalten.knopf')}
        </Button>
        <BetaNotice />
        <LegalLinks />
      </Section>
    </BusinessFrame>
  )
}
