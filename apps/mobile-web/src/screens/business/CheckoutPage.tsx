import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { useBusinessControllerCheckout } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, Note, ProblemNote, Section } from './BusinessFrame'
import type { ApiProblem } from './businessKit'
import { attempt, useSingleFlight } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

/** Unlocking the year at the self-employment tier (ADR-0101 §21): fill-in help and exports are part of it. */
export function CheckoutPage({ taxYear, onBack, openCheckout = (url) => window.location.assign(url) }: BusinessPageProps & { readonly openCheckout?: (url: string) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const checkout = useBusinessControllerCheckout()
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  // API-4: one checkout per tap, not one per double tap.
  const flight = useSingleFlight()

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
        {problem?.code === 'PAYMENT_TIER_NOT_CONFIGURED' || problem?.status === 503 ? (
          <Note tone="error" testID="checkout-nicht-eingerichtet">
            {tr('business.freischalten.nichtEingerichtet')}
          </Note>
        ) : problem !== null ? (
          <ProblemNote problem={problem} testID="business-speichern-fehler" />
        ) : null}
        <Button onPress={() => void flight.run(pay)} disabled={flight.busy} testID="checkout-selbststaendig">
          {tr('business.freischalten.knopf')}
        </Button>
      </Section>
    </BusinessFrame>
  )
}
