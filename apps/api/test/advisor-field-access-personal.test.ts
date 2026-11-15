// ADR-0091 / C4: what the owl may now fill goes through the same write path as every other draft.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const YEAR = 2025
const consent = { personalDataConsent: true }

function setup() {
  const ch = new FakeChSalaryCertificateRepository()
  const capital = new FakeCapitalRepository()
  const rental = new FakeRentalRepository()
  const masterData = new FakeMasterDataRepository()
  const link = new FakeLinkRepository()
  const filingTypes: Array<[string, number, string]> = []
  const access = fieldAccessFrom({
    lstb: new FakeLstbRepository(),
    pension: new FakePensionRepository(),
    capital,
    rental,
    profile: new FakeProfileRepository(),
    masterData,
    link,
    chSalaryCertificate: ch,
    linkFilingType: async (userId, taxYear, filingType) => {
      filingTypes.push([userId, taxYear, filingType])
    },
  })
  const confirmation = new ConfirmationService(new FakeMarkingRepository(), access, new AuditService(new FakeAuditRepository()))
  return { confirmation, ch, capital, rental, masterData, filingTypes }
}

describe('fields the owl fills since ADR-0091', () => {
  it('stores the exchange rate: without a month it is the annual average of the year, with a month the BMF monthly rate', async () => {
    const { confirmation, ch } = setup()
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'chLohnausweis.wechselkurs', '1,065')
    expect(await ch.findForUserAndYear('u', YEAR)).toMatchObject({ exchangeRateValue: 1.065, exchangeRateMonth: '2025', exchangeRateMode: 'jahresdurchschnitt' })
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'chLohnausweis.wechselkursMonat', '2025-03')
    expect(await ch.findForUserAndYear('u', YEAR)).toMatchObject({ exchangeRateValue: 1.065, exchangeRateMonth: '2025-03', exchangeRateMode: 'amtlich' })
    expect(await confirmation.readRawValue('u', YEAR, 'chLohnausweis.wechselkurs')).toBe('1.065')
    expect(await confirmation.readRawValue('u', YEAR, 'chLohnausweis.wechselkursMonat')).toBe('2025-03')
  })

  it('takes the month first and the rate after, as a draft with a companion writes them', async () => {
    const { confirmation, ch } = setup()
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'chLohnausweis.wechselkursMonat', '2025')
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'chLohnausweis.wechselkurs', '1.065')
    expect(await ch.findForUserAndYear('u', YEAR)).toMatchObject({ exchangeRateValue: 1.065, exchangeRateMonth: '2025', exchangeRateMode: 'jahresdurchschnitt' })
  })

  it('stores whose depot it is', async () => {
    const { confirmation, capital } = setup()
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'kapital.inhaber', 'gemeinsam')
    expect((await capital.findForUserAndYear('u', YEAR))?.inhaber ?? (await capital.findForUserAndYear('u', YEAR))?.owner).toBe('gemeinsam')
    expect(await confirmation.readRawValue('u', YEAR, 'kapital.inhaber')).toBe('gemeinsam')
  })

  it('describes a rental object: area, units, AfA as last year, and with consent its address', async () => {
    const { confirmation, rental } = setup()
    const object = await rental.create('u', YEAR)
    await confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.livingArea`, '85')
    await confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.einheiten`, '3')
    await confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.depreciationAsLastYear`, 'true')
    await confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.umlagen`, '1200')
    await expect(confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.strasse`, 'Lindenweg')).rejects.toThrow(/Einwilligung/)
    await confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.strasse`, 'Lindenweg', undefined, undefined, consent)
    await confirmation.writeConfirmedByAdvisor('u', YEAR, `vermietung:${object.id}.city`, 'Freiburg', undefined, undefined, consent)
    const [stored] = await rental.listForUserAndYear('u', YEAR)
    expect(stored).toMatchObject({ livingArea: '85', einheiten: '3', depreciationAsLastYear: true, umlagen: '1200', strasse: 'Lindenweg', city: 'Freiburg' })
    expect(await confirmation.readRawValue('u', YEAR, `vermietung:${object.id}.depreciationAsLastYear`)).toBe('true')
  })

  it('records the time of the consent with the religion it writes (Art. 9 DSGVO)', async () => {
    const { confirmation, masterData } = setup()
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'stammdaten.religion', 'VD', undefined, undefined, consent)
    const stored = await masterData.findByUserId('u')
    expect(stored?.religion).toBe('VD')
    expect(stored?.religionEinwilligungAm).toBeInstanceOf(Date)
  })

  it('sets up the joint return the way the mask does, so there is a Person B to record for', async () => {
    const { confirmation, filingTypes } = setup()
    await confirmation.writeConfirmedByAdvisor('u', YEAR, 'kopplung.filingType', 'zusammen', undefined, undefined, consent)
    expect(filingTypes).toEqual([['u', YEAR, 'zusammen']])
  })

  it('keeps personal fields closed on the write path without consent', async () => {
    const { confirmation } = setup()
    await expect(confirmation.writeConfirmedByAdvisor('u', YEAR, 'profil.steuerId', '12345678901')).rejects.toThrow(/Einwilligung/)
    await expect(confirmation.writeConfirmedByAdvisor('u', YEAR, 'kopplung.invitationCode', 'ABC', undefined, undefined, consent)).rejects.toThrow(/niemals/)
  })
})
