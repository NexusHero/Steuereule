import { describe, expect, it } from 'vitest'
import type { CommuteInputs, CommuteRepository } from '../src/commute/commute.repository.js'
import { CommuteService } from '../src/commute/commute.service.js'

function fakeRepository(): CommuteRepository & { saved: Map<string, CommuteInputs> } {
  const saved = new Map<string, CommuteInputs>()
  return {
    saved,
    findForUserAndYear: async (userId, year) => saved.get(`${userId}:${year}`) ?? null,
    save: async (userId, year, inputs) => {
      saved.set(`${userId}:${year}`, inputs)
      return inputs
    },
  }
}

const INPUTS: CommuteInputs = {
  workdays: [1, 2, 3, 4, 5],
  vacationDays: 30,
  sickDays: 5,
  homeOfficeDays: 20,
  oneWayKm: 30,
  transport: 'pkw',
  workplace: '79539 Lörrach, Hauptstraße 1',
}

describe('ArbeitswegService', () => {
  it('reports nothing entered yet for a fresh tax year', async () => {
    const service = new CommuteService(fakeRepository())

    const status = await service.getState('user-1', 2025)

    expect(status).toEqual({ inputs: null, workdays: null, commuterAllowance: null })
  })

  it('stores the facts and derives Pendlertage and the Entfernungspauschale from the core', async () => {
    const service = new CommuteService(fakeRepository())

    const status = await service.save('user-1', 2025, INPUTS)

    expect(status.inputs).toEqual(INPUTS)
    expect(status.workdays).toEqual({ weekdays: 261, workdays: 226, commuteDays: 206 })
    expect(status.commuterAllowance).toBe(2019)
  })

  it('subtracts the confirmed public holidays from the commute days (F4)', async () => {
    const service = new CommuteService(fakeRepository())
    const without = await service.save('user-1', 2025, INPUTS)
    const withValue = await service.save('user-1', 2025, { ...INPUTS, publicHolidays: 11, publicHolidayRegion: 'BW' })

    expect(withValue.workdays!.commuteDays).toBe(without.workdays!.commuteDays - 11)
    expect(withValue.commuterAllowance!).toBeLessThan(without.commuterAllowance!)
  })

  it('leaves the Pauschale open until distance and means of travel are known', async () => {
    const service = new CommuteService(fakeRepository())

    const status = await service.save('user-1', 2025, { ...INPUTS, oneWayKm: null })

    expect(status.workdays?.commuteDays).toBe(206)
    expect(status.commuterAllowance).toBeNull()
  })

  it('refuses more days off than working days', async () => {
    const service = new CommuteService(fakeRepository())

    const save = service.save('user-1', 2025, { ...INPUTS, vacationDays: 300 })

    await expect(save).rejects.toMatchObject({ code: 'ARBEITSTAGE_WIDERSPRUCH' })
  })

  it('subtracts the holidays of the state when only the state is known (scenario Lena: 216 days)', async () => {
    const service = new CommuteService(fakeRepository())
    const status = await service.save('user-1', 2025, { ...INPUTS, oneWayKm: 70, vacationDays: 30, sickDays: 4, homeOfficeDays: 0, publicHolidays: null, publicHolidayRegion: 'BW' })
    expect(status.workdays?.commuteDays).toBe(216)
    // 216 × (20 × 0,30 € + 50 × 0,38 €) = 5.400 €, as the acceptance fixture computes by hand.
    expect(status.commuterAllowance).toBe(5400)
  })
})
