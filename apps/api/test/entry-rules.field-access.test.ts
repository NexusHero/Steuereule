// ADR-0093: the fixed rules on the one write path of masks and owl drafts.
import { annexNGreAmounts, annualAverageRate, wageTaxCertificateStatus } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { nGreInputFromRecord } from '../src/ch-salary-certificate/salary-certificate-data.js'
import { ChSalaryCertificateService } from '../src/ch-salary-certificate/ch-salary-certificate.service.js'
import { CommuteService } from '../src/commute/commute.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { wageTaxCertificateDataFrom } from '../src/lstb/lstb-data.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const YEAR = 2024

function setup() {
  const lstb = new FakeLstbRepository()
  const commute = new FakeCommuteRepository()
  const chSalaryCertificate = new FakeChSalaryCertificateRepository()
  const interview = new FakeInterviewAnswerRepository()
  const audit = new AuditService(new FakeAuditRepository())
  const access = fieldAccessFrom({ lstb, pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), commute, chSalaryCertificate, interview })
  const confirmation = new ConfirmationService(new FakeMarkingRepository(), access, audit)
  const write = (target: string, value: string | null) => confirmation.writeConfirmedByAdvisor('u', YEAR, target, value)
  return { lstb, commute, chSalaryCertificate, interview, audit, write }
}

describe('LStB Zeilen 22–27 through the field access', () => {
  it('adds the employee lines itself once all four are there, and leaves the employer line out', async () => {
    const { lstb, write } = setup()
    await write('lstb.rvArbeitnehmer', '6150')
    await write('lstb.rvArbeitgeber', '6150')
    await write('lstb.kvArbeitnehmer', '0')
    await write('lstb.pvArbeitnehmer', '0')
    expect((await lstb.findForUserAndYear('u', YEAR))?.sozialversicherung ?? null).toBeNull()
    await write('lstb.avArbeitnehmer', '520')
    expect((await lstb.findForUserAndYear('u', YEAR))?.sozialversicherung).toBe('6670')
  })

  it('counts the social security as open while Zeile 25 or 26 is filled and Zeile 24 unanswered', async () => {
    const { lstb, write } = setup()
    for (const [field, value] of [['bruttoarbeitslohn', '60000'], ['lohnsteuer', '9000'], ['rvArbeitnehmer', '6150'], ['kvArbeitnehmer', '3100'], ['pvArbeitnehmer', '640'], ['avArbeitnehmer', '520']]) {
      await write(`lstb.${field}`, value!)
    }
    const open = wageTaxCertificateStatus(wageTaxCertificateDataFrom(await lstb.findForUserAndYear('u', YEAR)))
    expect(open).toEqual({ kind: 'unvollstaendig', open: ['sozialversicherung'], unclear: [] })
    await write('lstb.zuschuesseKvPv', '0')
    const complete = wageTaxCertificateStatus(wageTaxCertificateDataFrom(await lstb.findForUserAndYear('u', YEAR)))
    expect(complete).toMatchObject({ kind: 'vollstaendig', sozialversicherung: 10410 })
  })

  it('the mask writes the same lines and reads the open Zeile 24', async () => {
    const { lstb, audit } = setup()
    const service = new LstbService(lstb, audit, new FakeMarkingRepository())
    const stored = await service.setLines('u', YEAR, { rvArbeitnehmer: 6150, kvArbeitnehmer: 3100, pvArbeitnehmer: 640, avArbeitnehmer: 520, solidaritaetszuschlag: 92.31 })
    expect(stored).toMatchObject({ sozialversicherung: 10410, subsidyOpen: true, solidaritaetszuschlag: 92.31, rvArbeitgeber: null })
    await service.setSubsidies('u', YEAR, { zuschuesseKvPv: 1500 })
    expect(await service.getLines('u', YEAR)).toMatchObject({ subsidyOpen: false, zuschuesseKvPv: 1500 })
    // A later save of one line keeps the others.
    expect(await service.setLines('u', YEAR, { zuschussPv: 300 })).toMatchObject({ kvArbeitnehmer: 3100, zuschussPv: 300, sozialversicherung: 10410 })
    await expect(service.setLines('u', YEAR, { kvArbeitnehmer: -1 })).rejects.toThrow(/whole-euro/)
  })
})

describe('days travelled and the shortest route', () => {
  const BASE = { workdays: [1, 2, 3, 4, 5] as const, vacationDays: 0, sickDays: 0, homeOfficeDays: 0, oneWayKm: 30, transport: 'pkw' as const, workplace: null }

  it('stated days replace the derived ones in the allowance and in what the mask shows', async () => {
    const { commute, write } = setup()
    const service = new CommuteService(commute)
    const derived = await service.save('u', YEAR, BASE)
    expect(derived.workdays?.commuteDays).toBe(262)
    await write('commute.travelDays', '205')
    const stated = await service.getState('u', YEAR)
    expect(stated.workdays?.commuteDays).toBe(205)
    expect(stated.commuterAllowance).toBe(Math.round(205 * (20 * 0.3 + 10 * 0.38)))
  })

  it('a way claimed for one employer period gives nothing for the rest of the year', async () => {
    const { commute } = setup()
    const service = new CommuteService(commute)
    const state = await service.save('u', YEAR, { ...BASE, periodFrom: '01.09.2024', travelDays: 40 })
    expect(state.commuterAllowance).toBe(Math.round(40 * (20 * 0.3 + 10 * 0.38)))
    const derived = await service.save('u', YEAR, { ...BASE, periodFrom: '01.09.2024', travelDays: null })
    expect(derived.workdays?.commuteDays).toBeLessThan(90)
  })

  it('refuses more travel days than the period has working days', async () => {
    const { commute, write } = setup()
    await new CommuteService(commute).save('u', YEAR, { ...BASE, periodFrom: '01.12.2024' })
    await expect(write('commute.travelDays', '40')).rejects.toThrow(/FAHRTAGE_WIDERSPRUCH|exceeds/)
  })

  it('stores the confirmation of the shortest route', async () => {
    const { commute, write } = setup()
    await new CommuteService(commute).save('u', YEAR, BASE)
    await write('commute.shortestRouteConfirmed', 'true')
    expect((await commute.findForUserAndYear('u', YEAR))?.shortestRouteConfirmed).toBe(true)
  })
})

describe('Swiss certificate', () => {
  it('takes a negative Ziffer 7 from the owl and from the mask, and nothing negative elsewhere', async () => {
    const { chSalaryCertificate, interview, audit, write } = setup()
    await write('chLohnausweis.andere-leistungen', '-75')
    expect((await chSalaryCertificate.findForUserAndYear('u', YEAR))?.fields['andere-leistungen']).toBe('-75')
    const service = new ChSalaryCertificateService(chSalaryCertificate, interview, audit)
    const state = await service.setField('u', YEAR, 'andere-leistungen', { kind: 'erfasst', value: -80 })
    expect(state.fields.find((f) => f.id === 'andere-leistungen')).toMatchObject({ kind: 'erfasst', value: -80 })
    await expect(service.setField('u', YEAR, 'lohn', { kind: 'erfasst', value: -80 })).rejects.toThrow(/non-negative/)
  })

  it('deducts the family allowance only when Ziffer 8 contains it', async () => {
    const { chSalaryCertificate, write } = setup()
    await write('chLohnausweis.bruttolohn-total', '100000')
    await write('chLohnausweis.familienzulagenChf', '2400')
    const rate = annualAverageRate(String(YEAR), 1.05)
    const rows = async () => annexNGreAmounts(nGreInputFromRecord((await chSalaryCertificate.findForUserAndYear('u', YEAR))!, rate)).chf
    // A record from before the question keeps its deduction.
    expect((await rows()).z15).toBe(97600)
    await write('chLohnausweis.familienzulagenImBruttolohn', 'false')
    expect((await rows()).z15).toBe(100000)
    await write('chLohnausweis.familienzulagenImBruttolohn', 'true')
    expect((await rows()).z15).toBe(97600)
  })

  it('keeps the health insurer when the mask saves the Säule 3a on its own, and the other way round', async () => {
    // The mask saves each provision field with its own request; a field the request leaves out stays as it is.
    const { chSalaryCertificate, interview, audit } = setup()
    const service = new ChSalaryCertificateService(chSalaryCertificate, interview, audit)
    await service.setProvision('u', YEAR, { krankenkasseChf: 3593 })
    await service.setProvision('u', YEAR, { saeule3aChf: 0 })
    expect(await chSalaryCertificate.findForUserAndYear('u', YEAR)).toMatchObject({ krankenkasseChf: '3593', saeule3aChf: '0' })
    await service.setProvision('u', YEAR, { krankenkasseChf: null })
    expect(await chSalaryCertificate.findForUserAndYear('u', YEAR)).toMatchObject({ krankenkasseChf: null, saeule3aChf: '0' })
  })

  it('keeps the supplementary insurance apart from the basic one', async () => {
    const { chSalaryCertificate, write } = setup()
    await write('chLohnausweis.krankenkasseChf', '4200')
    await write('chLohnausweis.krankenkasseZusatzChf', '900')
    await write('chLohnausweis.kvZuschussAnspruch', 'false')
    const record = await chSalaryCertificate.findForUserAndYear('u', YEAR)
    expect(record).toMatchObject({ krankenkasseChf: '4200', nGre: { krankenkasseZusatzChf: '900', kvZuschussAnspruch: false } })
  })
})
