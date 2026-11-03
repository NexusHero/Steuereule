import { describe, expect, it } from 'vitest'
import { EulenModusService } from '../src/eulen-modus/eulen-modus.service.js'
import { RagKiAdapter } from '../src/ki/ki.adapter.js'
import {
  FakeEulenEinstellungRepository,
  FakeEulenKartenVerwurfRepository,
} from './fakes/fake-eulen-modus.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeKindRepository } from './fakes/fake-kind.repository.js'
import { FakeBelegRepository } from './fakes/fake-beleg.repository.js'
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
      new FakeLstbRepository(),
      new FakeBelegRepository(),
      new FakeKindRepository(),
      new FakeInterviewAnswerRepository(),
      new FakeBescheidRepository(),
      new RagKiAdapter(),
      new FakeAuditService() as any,
    )

    const res = await service.getKarten('user-1', 2025)
    expect(res.aktiviert).toBe(false)
    expect(res.karten).toHaveLength(0)
  })

  it('activates Eulen-Modus, evaluates real interview/bescheid facts, and filters dismissed cards', async () => {
    const einstellungRepo = new FakeEulenEinstellungRepository()
    const verwurfRepo = new FakeEulenKartenVerwurfRepository()
    const lstbRepo = new FakeLstbRepository()
    const belegRepo = new FakeBelegRepository()
    const kinderRepo = new FakeKindRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()
    const bescheidRepo = new FakeBescheidRepository()
    const kiAdapter = new RagKiAdapter()
    const audit = new FakeAuditService()

    const service = new EulenModusService(
      einstellungRepo,
      verwurfRepo,
      lstbRepo,
      belegRepo,
      kinderRepo,
      interviewRepo,
      bescheidRepo,
      kiAdapter,
      audit as any,
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

    // Activate
    const setRes = await service.setEinstellung(userId, true)
    expect(setRes.aktiviert).toBe(true)
    expect(setRes.aktiviertAm).toBeDefined()

    // Get cards
    const res = await service.getKarten(userId, jahr)
    expect(res.aktiviert).toBe(true)
    expect(res.karten.length).toBe(4)

    // Verify RAG source translation on the first card
    const firstCard = res.karten[0]!
    expect(firstCard.fingerprint).toBeDefined()
    expect(firstCard.quelleUebersetzt).toContain('Rechtsstand 01.01.2025')

    // Dismiss first card
    await service.verwerfeKarte(userId, jahr, firstCard.fingerprint)

    // Re-query: dismissed card must be filtered out
    const resAfterDismiss = await service.getKarten(userId, jahr)
    expect(resAfterDismiss.karten.find((k) => k.fingerprint === firstCard.fingerprint)).toBeUndefined()
    expect(resAfterDismiss.karten.length).toBe(3)
  })
})
