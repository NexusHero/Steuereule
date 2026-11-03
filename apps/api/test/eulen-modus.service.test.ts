import { describe, expect, it } from 'vitest'
import { EulenModusService } from '../src/eulen-modus/eulen-modus.service.js'
import { RagKiAdapter } from '../src/ki/ki.adapter.js'
import {
  FakeEulenEinstellungRepository,
  FakeEulenKartenVerwurfRepository,
} from './fakes/fake-eulen-modus.repository.js'
import { FakeKindRepository } from './fakes/fake-kind.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeBescheidRepository } from './fakes/fake-bescheid.repository.js'

class FakeAuditService {
  append(): Promise<void> {
    return Promise.resolve()
  }
}

describe('EulenModusService', () => {
  it('returns empty list when Eulen-Modus is not activated', async () => {
    const service = new EulenModusService(
      new FakeEulenEinstellungRepository(),
      new FakeEulenKartenVerwurfRepository(),
      new FakeKindRepository(),
      new FakeInterviewAnswerRepository(),
      new FakeBescheidRepository(),
      new RagKiAdapter(),
      new FakeAuditService() as never,
    )

    const res = await service.getKarten('user-1', 2025)
    expect(res.aktiviert).toBe(false)
    expect(res.karten).toHaveLength(0)
  })

  it('activates Eulen-Modus, evaluates real interview/bescheid facts, and filters dismissed cards', async () => {
    const einstellungRepo = new FakeEulenEinstellungRepository()
    const verwurfRepo = new FakeEulenKartenVerwurfRepository()
    const kinderRepo = new FakeKindRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()
    const bescheidRepo = new FakeBescheidRepository()
    const kiAdapter = new RagKiAdapter()
    const audit = new FakeAuditService()

    const service = new EulenModusService(
      einstellungRepo,
      verwurfRepo,
      kinderRepo,
      interviewRepo,
      bescheidRepo,
      kiAdapter,
      audit as never,
    )

    const userId = 'user-1'
    const jahr = 2025

    // Seed real interview facts for 2025 (Homeoffice + Fortbildung without Fahrtkosten) and 2024 (Spenden + Bescheid)
    await interviewRepo.write({ userId, steuerjahr: jahr, questionId: 'homeoffice', value: 'Fast immer', openItems: 0 })
    await interviewRepo.write({ userId, steuerjahr: jahr, questionId: 'tage', value: '200', openItems: 0 })
    await interviewRepo.write({ userId, steuerjahr: jahr, questionId: 'fortbildung', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId, steuerjahr: jahr - 1, questionId: 'spenden-betrag', value: '300', openItems: 0 })
    await interviewRepo.write({ userId, steuerjahr: jahr - 1, questionId: 'homeoffice', value: '1–2 Tage pro Woche', openItems: 0 })
    await bescheidRepo.setDatum(userId, jahr - 1, '2025-10-15')

    const setRes = await service.setEinstellung(userId, true)
    expect(setRes.aktiviert).toBe(true)
    expect(setRes.aktiviertAm).toBeDefined()

    const heute = '2025-11-01'
    const res = await service.getKarten(userId, jahr, heute)
    expect(res.aktiviert).toBe(true)
    expect(res.karten.map((k) => k.kategorie)).toEqual(['cockpit_proaktiv', 'archiv_einspruch', 'abruf_frage', 'abruf_frage'])

    const firstCard = res.karten[0]!
    expect(firstCard.betragEur).toBe(1200)
    expect(firstCard.quelleUebersetzt).toContain('§ 4 Abs. 5 Satz 1 Nr. 6c EStG, Rechtsstand 01.01.2025')
    expect(res.karten[1]!.einspruchFristBis).toBe('15.11.2025')
    expect(res.karten[1]!.betragEur).toBe(396)

    expect((await service.getKarten(userId, jahr, '2025-11-16')).karten.map((k) => k.kategorie)).not.toContain(
      'archiv_einspruch',
    )

    await service.verwerfeKarte(userId, jahr, firstCard.fingerprint)

    const resAfterDismiss = await service.getKarten(userId, jahr, heute)
    expect(resAfterDismiss.karten.find((k) => k.fingerprint === firstCard.fingerprint)).toBeUndefined()
    expect(resAfterDismiss.karten.length).toBe(3)
  })
})
