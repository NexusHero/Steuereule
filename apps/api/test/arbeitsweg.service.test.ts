import { describe, expect, it } from 'vitest'
import type { ArbeitswegEingaben, ArbeitswegRepository } from '../src/arbeitsweg/arbeitsweg.repository.js'
import { ArbeitswegService } from '../src/arbeitsweg/arbeitsweg.service.js'

function fakeRepository(): ArbeitswegRepository & { gespeichert: Map<string, ArbeitswegEingaben> } {
  const gespeichert = new Map<string, ArbeitswegEingaben>()
  return {
    gespeichert,
    findForUserAndYear: async (userId, jahr) => gespeichert.get(`${userId}:${jahr}`) ?? null,
    save: async (userId, jahr, eingaben) => {
      gespeichert.set(`${userId}:${jahr}`, eingaben)
      return eingaben
    },
  }
}

const EINGABEN: ArbeitswegEingaben = {
  arbeitstage: [1, 2, 3, 4, 5],
  urlaubstage: 30,
  krankheitstage: 5,
  homeofficeTage: 20,
  einfacheKm: 30,
  verkehrsmittel: 'pkw',
  taetigkeitsstaette: '79539 Lörrach, Hauptstraße 1',
}

describe('ArbeitswegService', () => {
  it('reports nothing entered yet for a fresh tax year', async () => {
    const service = new ArbeitswegService(fakeRepository())

    const stand = await service.getState('user-1', 2025)

    expect(stand).toEqual({ eingaben: null, werktage: null, pendlerpauschale: null })
  })

  it('stores the facts and derives Pendlertage and the Entfernungspauschale from the core', async () => {
    const service = new ArbeitswegService(fakeRepository())

    const stand = await service.save('user-1', 2025, EINGABEN)

    expect(stand.eingaben).toEqual(EINGABEN)
    expect(stand.werktage).toEqual({ wochentage: 261, werktage: 226, pendlertage: 206 })
    expect(stand.pendlerpauschale).toBe(2019)
  })

  it('leaves the Pauschale open until distance and means of travel are known', async () => {
    const service = new ArbeitswegService(fakeRepository())

    const stand = await service.save('user-1', 2025, { ...EINGABEN, einfacheKm: null })

    expect(stand.werktage?.pendlertage).toBe(206)
    expect(stand.pendlerpauschale).toBeNull()
  })

  it('refuses more days off than working days', async () => {
    const service = new ArbeitswegService(fakeRepository())

    const speichern = service.save('user-1', 2025, { ...EINGABEN, urlaubstage: 300 })

    await expect(speichern).rejects.toMatchObject({ code: 'ARBEITSTAGE_WIDERSPRUCH' })
  })
})
