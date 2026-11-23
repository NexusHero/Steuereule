// The folded further details: amounts, the child's insurance, the Swiss allowance and childcare.
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, Feld, Input, Option, type UiTheme } from '@steuereule/ui'
import { CHILDCARE_PROVIDER_WIDTH_PT, cutToPrintBox, fitsPrintBox, formatEuro } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { type makeStyles } from './ChildrenScreen.styles'
import { SpouseRelationshipField } from './SpouseRelationshipField'
import { type ChildForm } from './useChildForm'

export interface ChildFormMoreDetailsProps {
  readonly form: ChildForm
  readonly styles: ReturnType<typeof makeStyles>
  readonly t: UiTheme
  readonly married: boolean
  readonly partnerName?: string | undefined
}

export function ChildFormMoreDetails({ form, styles, t, married, partnerName }: ChildFormMoreDetailsProps) {
  const { t: tr } = useTranslation(APP_NS)
  const {
    childBenefit,
    setChildBenefit,
    swissAllowance,
    setSwissAllowance,
    swissPayer,
    setSwissPayer,
    swissDerived,
    kvBasis,
    setKvBasis,
    pv,
    setPv,
    healthAbroad,
    setHealthAbroad,
    childcare,
    setChildcare,
    childcareProvider,
    setChildcareProvider,
    providerFull,
    setProviderFull,
    childcareFrom,
    setChildcareFrom,
    childcareTo,
    setChildcareTo,
  } = form
  return (
    <>
      {married ? null : <SpouseRelationshipField styles={styles} {...(partnerName ? { partnerName } : {})} relationshipB={form.relationshipB} setRelationshipB={form.setRelationshipB} />}
      <Feld label="Erhaltenes Kindergeld im Steuerjahr (optional in €)">
        <Input
          value={childBenefit}
          onChange={setChildBenefit}
          placeholder="3000"
          type="numeric"
          accessibilityLabel="Kindergeld"
          testID="kind-kindergeld"
        />
      </Feld>
      <Feld label="Schweizer Kinderzulage im Steuerjahr (in €, optional)">
        <Input
          value={swissAllowance}
          onChange={setSwissAllowance}
          placeholder={swissDerived ? `${swissDerived} (aus dem Lohnausweis)` : 'z.B. 2748'}
          type="numeric"
          accessibilityLabel="Schweizer Kinderzulage"
          testID="kind-schweizer-kinderzulage"
        />
        {/* The cross-border mask asks the same figure (real-data run 4): say that it is one figure, not two. */}
        <Text style={{ ...t.type.small, color: t.color.tinte2 }} testID="kind-kinderzulage-hinweis">
          {swissDerived ? tr('kinder.kinderzulageAusLohnausweis', { betrag: formatEuro(Number(swissDerived)) }) : tr('kinder.kinderzulageHinweis')}
        </Text>
      </Feld>
      {married ? (
        <Feld label={tr('kinder.zulageVon', 'Die Kinderzulage kommt mit dem Lohn von')}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip active={swissPayer === 'A'} onPress={() => setSwissPayer(swissPayer === 'A' ? null : 'A')} testID="kind-zulage-von-a">
              {tr('kinder.zulageVonMir', 'mir')}
            </Chip>
            <Chip active={swissPayer === 'B'} onPress={() => setSwissPayer(swissPayer === 'B' ? null : 'B')} testID="kind-zulage-von-b">
              {partnerName ?? tr('kinder.zulageVonPartner', 'meinem Partner')}
            </Chip>
          </View>
        </Feld>
      ) : null}
      <Feld label="Krankenversicherung des Kindes, die ihr zahlt (Basisabsicherung, € im Jahr, optional)">
        <Input
          value={kvBasis}
          onChange={setKvBasis}
          placeholder="z.B. 1080"
          type="numeric"
          accessibilityLabel="Krankenversicherung des Kindes"
        />
      </Feld>
      <Option selected={healthAbroad} onPress={() => setHealthAbroad(!healthAbroad)} testID="kind-kv-ausland">
        Bei einer Kasse im Ausland versichert (z. B. Schweizer Grundversicherung)
      </Option>
      <Feld label="Pflegeversicherung des Kindes, die ihr zahlt (€ im Jahr, optional)">
        <Input value={pv} onChange={setPv} placeholder="z.B. 0" type="numeric" accessibilityLabel="Pflegeversicherung des Kindes" />
      </Feld>
      <Feld label="Kinderbetreuung, die ihr bezahlt habt (Kita, Tagesmutter, Hort; ohne Essen; € im Jahr, optional)">
        <Input value={childcare} onChange={setChildcare} placeholder="z.B. 739" type="numeric" accessibilityLabel="Kinderbetreuungskosten" testID="kind-betreuung" />
      </Feld>
      <Feld label="Art der Betreuung, Name und Anschrift des Anbieters">
        <Input
          value={childcareProvider}
          onChange={(next) => {
            // Only what fits the form's line (Anlage Kind Z. 67) — the printout would refuse the rest after payment (ADR-0090).
            if (fitsPrintBox(next.trim(), CHILDCARE_PROVIDER_WIDTH_PT)) {
              setProviderFull(null)
              setChildcareProvider(next)
              return
            }
            // Typed one character too many: nothing changes. A longer text (pasted) is cut to what fits, never dropped.
            const kept = cutToPrintBox(next, CHILDCARE_PROVIDER_WIDTH_PT)
            setProviderFull(kept === childcareProvider ? 'voll' : 'gekuerzt')
            setChildcareProvider(kept)
          }}
          placeholder="z.B. Kindergarten, Gemeinde Musterdorf, Hauptstr. 1"
          accessibilityLabel="Anbieter der Kinderbetreuung"
          testID="kind-betreuung-anbieter"
        />
        {providerFull ? (
          <Text style={{ ...t.type.small, color: t.color.warn }} accessibilityLiveRegion="polite" testID="kind-betreuung-anbieter-voll">
            {tr(providerFull === 'gekuerzt' ? 'kinder.anbieterGekuerzt' : 'kinder.anbieterVoll')}
          </Text>
        ) : null}
      </Feld>
      <Feld label="Betreut vom (TT.MM.JJJJ)">
        <Input value={childcareFrom} onChange={setChildcareFrom} placeholder="01.01.2025" accessibilityLabel="Betreut vom" testID="kind-betreuung-von" />
      </Feld>
      <Feld label="Betreut bis (TT.MM.JJJJ)">
        <Input value={childcareTo} onChange={setChildcareTo} placeholder="31.12.2025" accessibilityLabel="Betreut bis" testID="kind-betreuung-bis" />
      </Feld>
    </>
  )
}
