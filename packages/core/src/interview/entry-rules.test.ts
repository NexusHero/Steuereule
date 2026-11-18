import { describe, expect, it } from 'vitest'
import { checkDraftRules, draftFollowUps, impliedCompanions, transportFollowUps } from './entry-rules'

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
})
