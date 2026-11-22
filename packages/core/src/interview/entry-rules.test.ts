import { describe, expect, it } from 'vitest'
import { checkDraftRules, draftFollowUps, impliedCompanions, sickPayQuestionForUser, transportFollowUps } from './entry-rules'

const stage = (screen: 'chLohnausweis' | 'kind' | 'lstb', values: Record<string, string>, others: { screen: 'chLohnausweis' | 'kind'; values: Record<string, string> }[] = []) =>
  checkDraftRules({ screen, values, tool: 'stage', others })

describe('fixed rules for drafts (ADR-0093)', () => {
  it('refuses a family allowance on the wage without the confirmation that Ziffer 8 contains it', () => {
    const refused = stage('chLohnausweis', { familienzulagenChf: '2400' })
    expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' })
    expect(stage('chLohnausweis', { familienzulagenChf: '2400', familienzulagenImBruttolohn: 'false' }).ok).toBe(false)
    expect(stage('chLohnausweis', { familienzulagenChf: '2400', familienzulagenImBruttolohn: 'true' }).ok).toBe(true)
  })

  it('lets an explicit 0 through: no allowance in the wage needs no confirmation', () => {
    expect(stage('chLohnausweis', { familienzulagenChf: '0' }).ok).toBe(true)
  })

  it('never takes the same allowance on the wage and on the child', () => {
    const child = { screen: 'kind' as const, values: { swissFamilyAllowanceEur: '2500' } }
    expect(stage('chLohnausweis', { familienzulagenChf: '2400', familienzulagenImBruttolohn: 'true' }, [child])).toMatchObject({ ok: false, code: 'DOUBLE_ENTRY' })
    const wage = { screen: 'chLohnausweis' as const, values: { familienzulagenChf: '2400', familienzulagenImBruttolohn: 'true' } }
    expect(stage('kind', { swissFamilyAllowanceEur: '2500' }, [wage])).toMatchObject({ ok: false, code: 'DOUBLE_ENTRY' })
    expect(stage('kind', { swissFamilyAllowanceEur: '2500' }).ok).toBe(true)
  })

  it('takes paid-out Krankentaggeld only as two paths', () => {
    expect(stage('chLohnausweis', { steuerfreiesKrankentaggeldChf: '2900' })).toMatchObject({ ok: false, code: 'TWO_PATHS_REQUIRED' })
    expect(checkDraftRules({ screen: 'chLohnausweis', values: { steuerfreiesKrankentaggeldChf: '2900' }, tool: 'two-paths', others: [] }).ok).toBe(true)
    expect(stage('chLohnausweis', { steuerfreiesKrankentaggeldChf: '0' }).ok).toBe(true)
  })

  it('takes a paid-out accident benefit (UVG/SUVA) only as two paths too, on its own field', () => {
    const refused = stage('chLohnausweis', { steuerfreiesUnfalltaggeldChf: '2250' })
    expect(refused).toMatchObject({ ok: false, code: 'TWO_PATHS_REQUIRED' })
    expect(refused.ok === false && refused.reason).toContain('steuerfreiesUnfalltaggeldChf')
    expect(refused.ok === false && refused.reason).toContain('Progressionsvorbehalt')
    expect(checkDraftRules({ screen: 'chLohnausweis', values: { steuerfreiesUnfalltaggeldChf: '2250' }, tool: 'two-paths', others: [] }).ok).toBe(true)
    expect(stage('chLohnausweis', { steuerfreiesUnfalltaggeldChf: '0' }).ok).toBe(true)
  })

  it('asks where the daily benefit came from, with the six answers, before any amount', () => {
    const asks = draftFollowUps('chLohnausweis', { 'bruttolohn-total': '98000' }).join(' ')
    expect(asks).toContain('woher das Taggeld')
    for (const answer of ['Krankentaggeldversicherung (mit dem Lohn verrechnet)', 'Lohnfortzahlung des Arbeitgebers ohne Versicherung', 'beides (Versicherung zahlt einen Teil, der Arbeitgeber stockt auf)', 'Unfallversicherung (UVG/SUVA)', 'Mutterschaft / IV', 'kein Taggeld']) {
      expect(asks).toContain(answer)
    }
    expect(asks).toContain('chLohnausweis.taggeldQuelle')
    expect(asks).toContain('steuerfreiesKrankentaggeldChf')
    expect(asks).toContain('steuerfreiesUnfalltaggeldChf')
    expect(asks).toContain('propose_two_paths')
    // An answer, or an amount in either field, is an answer to the one question.
    expect(draftFollowUps('chLohnausweis', { 'bruttolohn-total': '98000', steuerfreiesUnfalltaggeldChf: '2250' }).join(' ')).not.toContain('Taggeld')
    expect(draftFollowUps('chLohnausweis', { 'bruttolohn-total': '98000', taggeldQuelle: 'kein' }).join(' ')).not.toContain('Taggeld')
  })

  it('names both paths for an accident benefit a remark carries with its amount, and asks for a missing amount', () => {
    const withAmount = sickPayQuestionForUser({ kind: 'accident', amountChf: 2250 })
    expect(withAmount).toContain('Unfalltaggeld')
    expect(withAmount).toContain('Ziffer 8')
    expect(withAmount).toContain('beide Wege')
    expect(withAmount).toContain('Progressionsvorbehalt')
    expect(withAmount).not.toContain('nichts vorbereitet')
    const withoutAmount = sickPayQuestionForUser({ kind: 'accident', amountChf: null })
    expect(withoutAmount).toContain('Unfalltaggeld')
    expect(withoutAmount).toContain('Betrag')
    expect(withoutAmount).not.toContain('beide Wege')
  })

  it('sets the gate of the prepayments itself', () => {
    expect(impliedCompanions('interview', { 'vorauszahlungen-betrag': '4800' })).toEqual({ 'vorauszahlungen-gate': 'Ja' })
    expect(impliedCompanions('interview', { 'vorauszahlungen-betrag': '4800', 'vorauszahlungen-gate': 'Ja' })).toEqual({})
    expect(impliedCompanions('interview', { job: 'Angestellt' })).toEqual({})
  })

  it('says that the commuter allowance needs the means of transport, without guessing one', () => {
    const unknownTransport = { transport: null, secondTransport: null }
    const asks = transportFollowUps({ oneWayKm: '28', travelDays: '205' }, unknownTransport)
    expect(asks).toHaveLength(1)
    expect(asks[0]).toContain('Entfernungspauschale')
    expect(asks[0]).toContain('commute.transport')
    expect(asks[0]).toContain('„pkw“, „oepnv“ oder „andere“')
    expect(transportFollowUps({ travelDays: '205' }, unknownTransport)).toHaveLength(1)
    // Stored or drafted alongside: nothing to say.
    expect(transportFollowUps({ oneWayKm: '28' }, { transport: 'pkw', secondTransport: null })).toEqual([])
    expect(transportFollowUps({ oneWayKm: '28', transport: 'oepnv' }, unknownTransport)).toEqual([])
    // Unknown stored state: no claim that it is missing.
    expect(transportFollowUps({ oneWayKm: '28' }, undefined)).toEqual([])
    expect(transportFollowUps({ oneWayKm: '0' }, unknownTransport)).toEqual([])
    expect(transportFollowUps({ professionalBodiesEur: '120' }, unknownTransport)).toEqual([])
  })

  it('says the same for the second way to work', () => {
    const asks = transportFollowUps({ secondOneWayKm: '12', secondTravelDays: '40' }, { transport: 'pkw', secondTransport: null })
    expect(asks).toHaveLength(1)
    expect(asks[0]).toContain('commute.secondTransport')
    expect(transportFollowUps({ secondOneWayKm: '12', secondTransport: 'pkw' }, { transport: 'pkw', secondTransport: null })).toEqual([])
    expect(transportFollowUps({ secondOneWayKm: '12' }, { transport: null, secondTransport: 'andere' })).toEqual([])
  })

  it('tells the model what to ask next', () => {
    expect(draftFollowUps('lstb', { kvArbeitnehmer: '3100', pvArbeitnehmer: '640' }).join(' ')).toContain('Zeile 24')
    expect(draftFollowUps('lstb', { kvArbeitnehmer: '3100', zuschuesseKvPv: '0' })).toEqual([])
    expect(draftFollowUps('commute', { oneWayKm: '28', travelDays: '30' }).join(' ')).toContain('kürzeste Straßenverbindung')
    expect(draftFollowUps('commute', { oneWayKm: '28', travelDays: '30', shortestRouteConfirmed: 'true' })).toEqual([])
    expect(draftFollowUps('chLohnausweis', { krankenkasseChf: '4200' }).join(' ')).toContain('VVG')
    expect(draftFollowUps('chLohnausweis', { krankenkasseChf: '4200', krankenkasseZusatzChf: '0' })).toEqual([])
  })

  describe('capital income is never answered with „Nein“ from a statement that names a deposit account', () => {
    const gate = (value: string, said: string) => checkDraftRules({ screen: 'interview', values: { einkuenfte: value }, tool: 'stage', others: [], said })

    it('refuses „Nein“ when the user names a deposit account or exemption orders', () => {
      const refused = gate('Nein', 'Kapitalerträge: gemeinsames Depot bei einer deutschen Bank, Freistellungsaufträge zusammen 1.600 Euro; Vermietung haben wir nicht.')
      expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' })
      expect(!refused.ok && refused.reason).toContain('kapital.kapitalertraege')
      expect(gate('Nein', 'Wir haben einen Freistellungsauftrag über 1.000 € bei der Sparkasse.').ok).toBe(false)
      expect(gate('Vermietung', 'Eine Wohnung ist vermietet, dazu ein Tagesgeldkonto mit Zinsen.').ok).toBe(false)
    })

    it('lets „Nein“ through when the user says there is no capital income, or says nothing about it', () => {
      expect(gate('Nein', 'Kapitalerträge hatten wir nicht, Vermietung auch nicht.').ok).toBe(true)
      expect(gate('Nein', 'Wir haben kein Depot und keine Zinsen.').ok).toBe(true)
      expect(gate('Nein', 'Weder Kapitalerträge noch Mieteinnahmen.').ok).toBe(true)
      expect(gate('Nein', 'Nein, nichts davon.').ok).toBe(true)
      expect(checkDraftRules({ screen: 'interview', values: { einkuenfte: 'Nein' }, tool: 'stage', others: [] }).ok).toBe(true)
    })

    it('never stands in the way of an answer that records the capital income', () => {
      expect(gate('Kapitalerträge', 'Gemeinsames Depot, Freistellungsaufträge 1.600 Euro.').ok).toBe(true)
      expect(gate('Beides', 'Depot und eine vermietete Wohnung.').ok).toBe(true)
    })
  })

  it('has the paid-out daily sickness benefit asked when a Swiss gross wage is drafted without it', () => {
    const asks = draftFollowUps('chLohnausweis', { 'bruttolohn-total': '98000' }).join(' ')
    expect(asks).toContain('Krankentaggeld')
    expect(asks).toContain('Ziffer 8')
    expect(asks).toContain('steuerfreiesKrankentaggeldChf')
    expect(draftFollowUps('chLohnausweis', { 'bruttolohn-total': '98000', steuerfreiesKrankentaggeldChf: '0' }).join(' ')).not.toContain('Krankentaggeld')
    expect(draftFollowUps('chLohnausweis', { arbeitgeberName: 'Muster AG' })).toEqual([])
  })

  // Real-data run: the gate said capital income, the amount was never asked.
  it('asks the amount of capital income when the answer drafted says there is some', () => {
    expect(draftFollowUps('interview', { einkuenfte: 'Kapitalerträge' }).join(' ')).toContain('kapital.kapitalertraege')
    expect(draftFollowUps('interview', { einkuenfte: 'Beides' }).join(' ')).toContain('Steuerbescheinigung')
    expect(draftFollowUps('interview', { einkuenfte: 'Vermietung' }).join(' ')).not.toContain('kapital.kapitalertraege')
  })

  it('has payment by transfer, the own household and subsidies asked for a craftsman invoice', () => {
    const asks = draftFollowUps('interview', { 'haushalt-handwerker-betrag': '1400' }).join(' ')
    expect(asks).toContain('Überweisung')
    expect(asks).toContain('eigenen Haushalt')
    expect(asks).toContain('Förderung')
    expect(draftFollowUps('interview', { 'haushalt-handwerker-betrag': '0' })).toEqual([])
    expect(draftFollowUps('interview', { 'haushalt-gate': 'Ja' })).toEqual([])
  })

  it('has the year of payment asked for a donation', () => {
    const asks = draftFollowUps('interview', { 'spenden-betrag': '300' }).join(' ')
    expect(asks).toContain('gezahlt')
    expect(asks).toContain('Zuwendungsbestätigung')
    expect(draftFollowUps('interview', { spenden: 'Ja' })).toEqual([])
  })
})

describe('the source of a daily benefit decides its field (ADR-0072, Punkt 5)', () => {
  const sourced = (taggeldQuelle: string, amounts: Record<string, string> = {}, tool: 'stage' | 'two-paths' = 'two-paths') =>
    checkDraftRules({ screen: 'chLohnausweis', values: { taggeldQuelle, ...amounts }, tool, others: [] })

  it('stores an answer without an amount as a plain draft', () => {
    for (const source of ['krankentaggeldversicherung', 'lohnfortzahlung', 'beides', 'unfallversicherung', 'mutterschaftIv', 'kein']) expect(sourced(source, {}, 'stage').ok, source).toBe(true)
  })

  it('writes 0 into the sickness field for continued pay and for no benefit: nothing is deducted', () => {
    expect(impliedCompanions('chLohnausweis', { taggeldQuelle: 'lohnfortzahlung' })).toEqual({ steuerfreiesKrankentaggeldChf: '0' })
    expect(impliedCompanions('chLohnausweis', { taggeldQuelle: 'kein' })).toEqual({ steuerfreiesKrankentaggeldChf: '0' })
    expect(impliedCompanions('chLohnausweis', { taggeldQuelle: 'krankentaggeldversicherung' })).toEqual({})
    expect(impliedCompanions('chLohnausweis', { taggeldQuelle: 'unfallversicherung' })).toEqual({})
  })

  it('refuses an amount to deduct for continued pay of the employer: it is wage', () => {
    const refused = sourced('lohnfortzahlung', { steuerfreiesKrankentaggeldChf: '4200' })
    expect(refused).toMatchObject({ ok: false, code: 'SOURCE_MISMATCH' })
    expect(refused.ok === false && refused.reason).toContain('Lohn')
    expect(sourced('kein', { steuerfreiesUnfalltaggeldChf: '900' })).toMatchObject({ ok: false, code: 'SOURCE_MISMATCH' })
    expect(sourced('lohnfortzahlung', { steuerfreiesKrankentaggeldChf: '0' }).ok).toBe(true)
  })

  it('keeps an accident benefit out of the sickness field and a sickness benefit out of the accident field', () => {
    expect(sourced('unfallversicherung', { steuerfreiesKrankentaggeldChf: '2250' })).toMatchObject({ ok: false, code: 'SOURCE_MISMATCH' })
    expect(sourced('unfallversicherung', { steuerfreiesUnfalltaggeldChf: '2250' }).ok).toBe(true)
    expect(sourced('krankentaggeldversicherung', { steuerfreiesUnfalltaggeldChf: '2250' })).toMatchObject({ ok: false, code: 'SOURCE_MISMATCH' })
    expect(sourced('krankentaggeldversicherung', { steuerfreiesKrankentaggeldChf: '4200' }).ok).toBe(true)
  })

  it('checks a path against the answer drafted in the same turn', () => {
    const others = [{ screen: 'chLohnausweis' as const, values: { taggeldQuelle: 'lohnfortzahlung' } }]
    expect(checkDraftRules({ screen: 'chLohnausweis', values: { steuerfreiesKrankentaggeldChf: '4200' }, tool: 'two-paths', others })).toMatchObject({ ok: false, code: 'SOURCE_MISMATCH' })
  })

  it('still takes a positive amount only as two paths', () => {
    expect(sourced('krankentaggeldversicherung', { steuerfreiesKrankentaggeldChf: '4200' }, 'stage')).toMatchObject({ ok: false, code: 'TWO_PATHS_REQUIRED' })
  })

  it('asks for the amount that fits the answer, for „beides“ the insurer’s part only', () => {
    const insurance = draftFollowUps('chLohnausweis', { taggeldQuelle: 'krankentaggeldversicherung' }).join(' ')
    expect(insurance).toContain('steuerfreiesKrankentaggeldChf')
    expect(insurance).toContain('propose_two_paths')
    const both = draftFollowUps('chLohnausweis', { taggeldQuelle: 'beides' }).join(' ')
    expect(both).toContain('nur den Teil der Versicherung')
    expect(both).toContain('Aufstockung')
    expect(both).toContain('bleibt Lohn')
    const accident = draftFollowUps('chLohnausweis', { taggeldQuelle: 'unfallversicherung' }).join(' ')
    expect(accident).toContain('steuerfreiesUnfalltaggeldChf')
    expect(accident).toContain('Progressionsvorbehalt')
    expect(draftFollowUps('chLohnausweis', { taggeldQuelle: 'lohnfortzahlung' })).toEqual([])
    expect(draftFollowUps('chLohnausweis', { taggeldQuelle: 'beides', steuerfreiesKrankentaggeldChf: '3360' })).toEqual([])
  })

  it('asks the user the same question under a wage statement, with the AHV hint when Ziffer 8 and 9 are known', () => {
    const plain = sickPayQuestionForUser(null)
    expect(plain).toContain('Woher kam')
    expect(plain).toContain('Lohnfortzahlung des Arbeitgebers ohne Versicherung')
    expect(plain).toContain('kein Taggeld')
    const remark = { kind: 'sickness' as const, amountChf: 6000 }
    const withHint = sickPayQuestionForUser(remark, { taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 5380 })
    expect(withHint).toContain('beide Wege')
    expect(withHint).toContain('Hinweis zur Plausibilität (keine Entscheidung)')
    expect(withHint).toContain('ohne das Taggeld')
    expect(sickPayQuestionForUser(remark)).not.toContain('Plausibilität')
  })

  it('recommends the insurance in the question when the remark and Ziffer 9 agree, and warns against keeping it as wage', () => {
    const question = sickPayQuestionForUser({ kind: 'sickness', amountChf: 20843 }, { taxYear: 2024, grossWageChf: 102736, ahvContributionsChf: 5205 })
    expect(question).toContain('Empfehlung: abziehen (Krankentaggeldversicherung)')
    expect(question).toContain('Bemerkung')
    expect(question).toContain('Taggeld-Abrechnung')
    expect(sickPayQuestionForUser({ kind: 'sickness', amountChf: 3853 }, { taxYear: 2025, grossWageChf: 115603, ahvContributionsChf: 7257 })).not.toContain('Empfehlung')
  })
})
