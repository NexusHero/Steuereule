import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import type { PartnershipShareDto } from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Figure, Note, ProblemNote, Section } from './BusinessFrame'
import { parseGermanAmount, parseSignedGermanAmount } from '../shared/germanNumber'
import { signedEuro } from './businessKit'
import { useProfileEditor } from './useProfileEditor'
import type { BusinessPageProps } from './BusinessScreen'

/** An amount typed the German way (WEB-46): undefined when empty, null when it is no amount. */
const parse = (raw: string, signed = false): number | undefined | null => {
  if (raw.trim() === '') return undefined
  return signed ? parseSignedGermanAmount(raw) : parseGermanAmount(raw)
}

/** Shares in a partnership, taken over from its Feststellungsbescheid (ADR-0101 §3): name, kind, profit, Messbetrag, trade tax. */
export function SharesPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { query, profile, loadProblem, save, problem, saving } = useProfileEditor(taxYear, person, business)
  const [form, setForm] = useState({ name: '', kind: 'freiberuf' as PartnershipShareDto['kind'], profit: '', base: '', tax: '' })
  const [invalid, setInvalid] = useState(false)

  if (query.isPending || profile === null || loadProblem !== null) {
    return (
      <BusinessFrame title={tr('business.seite.beteiligungen')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const shares = profile.partnershipShares

  async function add() {
    if (saving) return
    const profit = parse(form.profit, true)
    const base = parse(form.base)
    const tax = parse(form.tax)
    if (form.name.trim() === '' || profit === undefined || profit === null || base === null || tax === null) return setInvalid(true)
    setInvalid(false)
    const share: PartnershipShareDto = { name: form.name.trim(), kind: form.kind, profitEur: profit, ...(base !== undefined ? { baseAmountEur: base } : {}), ...(tax !== undefined ? { tradeTaxEur: tax } : {}) }
    // The list is replaced whole; while one change is on its way the buttons wait, so none builds on a stale list (NC-15).
    if (await save({ partnershipShares: [...shares, share] })) setForm({ name: '', kind: 'freiberuf', profit: '', base: '', tax: '' })
  }

  return (
    <BusinessFrame title={tr('business.seite.beteiligungen')} onBack={onBack} testID="beteiligungen-seite">
      <ProblemNote problem={problem} testID="business-speichern-fehler" />
      <Section>
        {shares.length === 0 ? <Note testID="beteiligungen-leer">{tr('business.beteiligungen.leer')}</Note> : null}
        {shares.map((share, index) => (
          <View key={`${share.name}-${index}`} testID={`beteiligung-${index}`}>
            <Figure label={`${share.name} · ${tr(`business.art.${share.kind}`)}`} value={signedEuro(share.profitEur)} />
            <Button variant="ghost" disabled={saving} onPress={() => void save({ partnershipShares: shares.filter((_, i) => i !== index) })} testID={`beteiligung-entfernen-${index}`}>
              {tr('business.beteiligungen.entfernen')}
            </Button>
          </View>
        ))}
      </Section>
      <Section title={tr('business.beteiligungen.neu')}>
        <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('business.beteiligungen.hinweis')}</Text>
        <Feld label={tr('business.beteiligungen.name')}>
          <Input value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} accessibilityLabel={tr('business.beteiligungen.name')} testID="beteiligung-name" />
        </Feld>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          {(['freiberuf', 'gewerbe'] as const).map((kind) => (
            <Choice key={kind} selected={form.kind === kind} onPress={() => setForm((f) => ({ ...f, kind }))} testID={`beteiligung-art-${kind}`}>
              {tr(`business.art.${kind}`)}
            </Choice>
          ))}
        </View>
        <Feld label={tr('business.beteiligungen.gewinn')}>
          <Input type="numeric" mono value={form.profit} onChange={(profit) => setForm((f) => ({ ...f, profit }))} accessibilityLabel={tr('business.beteiligungen.gewinn')} testID="beteiligung-gewinn" />
        </Feld>
        {form.kind === 'gewerbe' ? (
          <>
            <Feld label={tr('business.beteiligungen.messbetrag')}>
              <Input type="numeric" mono value={form.base} onChange={(base) => setForm((f) => ({ ...f, base }))} accessibilityLabel={tr('business.beteiligungen.messbetrag')} testID="beteiligung-messbetrag" />
            </Feld>
            <Feld label={tr('business.beteiligungen.gewerbesteuer')}>
              <Input type="numeric" mono value={form.tax} onChange={(tax) => setForm((f) => ({ ...f, tax }))} accessibilityLabel={tr('business.beteiligungen.gewerbesteuer')} testID="beteiligung-gewerbesteuer" />
            </Feld>
          </>
        ) : null}
        {invalid ? <Note tone="error">{tr('business.beteiligungen.ungueltig')}</Note> : null}
        <Button onPress={() => void add()} disabled={saving} testID="beteiligung-hinzufuegen">
          {tr('business.beteiligungen.hinzufuegen')}
        </Button>
      </Section>
    </BusinessFrame>
  )
}
