// A way the owl writes starts from the same Bundesland the Arbeitstage mask starts from.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const YEAR = 2025
const consent = { personalDataConsent: true }

async function setup(homePostalCode?: string) {
  const commute = new FakeCommuteRepository()
  const masterData = new FakeMasterDataRepository()
  if (homePostalCode !== undefined) await masterData.save('u', { plz: homePostalCode } as MasterDataRecord)
  const access = fieldAccessFrom({
    lstb: new FakeLstbRepository(),
    pension: new FakePensionRepository(),
    capital: new FakeCapitalRepository(),
    rental: new FakeRentalRepository(),
    profile: new FakeProfileRepository(),
    masterData,
    commute,
  })
  const confirmation = new ConfirmationService(new FakeMarkingRepository(), access, new AuditService(new FakeAuditRepository()))
  const write = (target: string, value: string | null) => confirmation.writeConfirmedByAdvisor('u', YEAR, target, value, undefined, undefined, consent)
  const region = async () => (await commute.findForUserAndYear('u', YEAR))?.publicHolidayRegion ?? null
  return { write, region }
}

describe('the public-holiday region of a way written through the field access', () => {
  it('takes the Bundesland of the workplace when its postal code names one', async () => {
    const { write, region } = await setup('10115')
    await write('commute.workplace', 'Durlacher Allee 50, 76131 Karlsruhe')
    expect(await region()).toBe('BW')
  })

  it('falls back to the Bundesland of the home address, as the mask does', async () => {
    const { write, region } = await setup('79102')
    await write('commute.oneWayKm', '18')
    expect(await region()).toBe('BW')
    await write('commute.workplace', 'Rheinweg 2, 4058 Basel')
    expect(await region()).toBe('BW')
  })

  it('stays open when neither address names a Bundesland', async () => {
    const { write, region } = await setup()
    await write('commute.workplace', 'Köln')
    expect(await region()).toBeNull()
  })

  it('leaves a region that is already set alone', async () => {
    const { write, region } = await setup('79102')
    await write('commute.publicHolidayRegion', 'NW')
    await write('commute.workplace', '76131 Karlsruhe, Durlacher Allee 50')
    expect(await region()).toBe('NW')
  })

  it('does not fill in a region the same write clears, nor one next to a counted number of holidays', async () => {
    const { write, region } = await setup('79102')
    await write('commute.publicHolidayRegion', null)
    expect(await region()).toBeNull()
    await write('commute.publicHolidays', '9')
    await write('commute.oneWayKm', '18')
    expect(await region()).toBeNull()
  })
})
