import { describe, expect, it } from 'vitest'
import { OwlModeService } from '../src/owl-mode/owl-mode.service.js'
import { RagKiAdapter } from '../src/ki/ki.adapter.js'
import {
  FakeOwlSettingRepository,
  FakeOwlCardDismissalRepository,
} from './fakes/fake-owl-mode.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'

class FakeAuditService {
  append(): Promise<void> {
    return Promise.resolve()
  }
}

describe('EulenModusService', () => {
  it('returns empty list when Eulen-Modus is not activated', async () => {
    const service = new OwlModeService(
      new FakeOwlSettingRepository(),
      new FakeOwlCardDismissalRepository(),
      new FakeChildRepository(),
      new FakeInterviewAnswerRepository(),
      new FakeAssessmentRepository(),
      new RagKiAdapter(),
      new FakeAuditService() as never,
    )

    const res = await service.getCards('user-1', 2025)
    expect(res.enabled).toBe(false)
    expect(res.cards).toHaveLength(0)
  })

  it('activates Eulen-Modus, evaluates real interview/bescheid facts, and filters dismissed cards', async () => {
    const settingRepo = new FakeOwlSettingRepository()
    const dismissalRepo = new FakeOwlCardDismissalRepository()
    const childrenRepo = new FakeChildRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()
    const assessmentRepo = new FakeAssessmentRepository()
    const kiAdapter = new RagKiAdapter()
    const audit = new FakeAuditService()

    const service = new OwlModeService(
      settingRepo,
      dismissalRepo,
      childrenRepo,
      interviewRepo,
      assessmentRepo,
      kiAdapter,
      audit as never,
    )

    const userId = 'user-1'
    const year = 2025

    // Seed real interview facts for 2025 (Homeoffice + Fortbildung without Fahrtkosten) and 2024 (Spenden + Bescheid)
    await interviewRepo.write({ userId, taxYear: year, questionId: 'homeoffice', value: 'Fast immer', openItems: 0 })
    await interviewRepo.write({ userId, taxYear: year, questionId: 'tage', value: '200', openItems: 0 })
    await interviewRepo.write({ userId, taxYear: year, questionId: 'fortbildung', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId, taxYear: year - 1, questionId: 'spenden-betrag', value: '300', openItems: 0 })
    await interviewRepo.write({ userId, taxYear: year - 1, questionId: 'homeoffice', value: '1–2 Tage pro Woche', openItems: 0 })
    await assessmentRepo.setDate(userId, year - 1, '2025-10-15')

    const setRes = await service.setSetting(userId, true)
    expect(setRes.enabled).toBe(true)
    expect(setRes.enabledAt).toBeDefined()

    const today = '2025-11-01'
    const res = await service.getCards(userId, year, today)
    expect(res.enabled).toBe(true)
    expect(res.cards.map((k) => k.category)).toEqual(['cockpit_proaktiv', 'archiv_einspruch', 'abruf_frage', 'abruf_frage'])

    const firstCard = res.cards[0]!
    expect(firstCard.amountEur).toBe(1200)
    expect(firstCard.sourceTranslated).toContain('§ 4 Abs. 5 Satz 1 Nr. 6c EStG, Rechtsstand 01.01.2025')
    expect(res.cards[1]!.appealDeadline).toBe('15.11.2025')
    expect(res.cards[1]!.amountEur).toBe(396)

    expect((await service.getCards(userId, year, '2025-11-16')).cards.map((k) => k.category)).not.toContain(
      'archiv_einspruch',
    )

    await service.dismissCard(userId, year, firstCard.fingerprint)

    const resAfterDismiss = await service.getCards(userId, year, today)
    expect(resAfterDismiss.cards.find((k) => k.fingerprint === firstCard.fingerprint)).toBeUndefined()
    expect(resAfterDismiss.cards.length).toBe(3)
  })

  it('turns the interview\'s occupation group into profession tips, each citing its EStG source', async () => {
    const settingRepo = new FakeOwlSettingRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()
    const service = new OwlModeService(
      settingRepo,
      new FakeOwlCardDismissalRepository(),
      new FakeChildRepository(),
      interviewRepo,
      new FakeAssessmentRepository(),
      new RagKiAdapter(),
      new FakeAuditService() as never,
    )
    await interviewRepo.write({ userId: 'user-1', taxYear: 2026, questionId: 'beruf', value: 'IT & Software', openItems: 0 })
    await service.setSetting('user-1', true)

    const res = await service.getCards('user-1', 2026, '2026-11-06')
    const tips = res.cards.filter((k) => k.id.startsWith('eule-beruf-'))
    expect(tips.map((k) => k.id)).toEqual(['eule-beruf-fortbildung-2026', 'eule-beruf-it-hardware-2026'])
    expect(tips[0]!.sourceTranslated).toContain('§ 9 Abs. 1 Satz 1 EStG')
    expect(tips[1]!.sourceTranslated).toContain('§ 9 Abs. 1 Satz 3 Nr. 6 und 7 EStG')
  })

  it('treats AMOUNT_LATER prior-year donations as not entered (null, never NaN) and still checks current year when deferred', async () => {
    const settingRepo = new FakeOwlSettingRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()
    const service = new OwlModeService(
      settingRepo,
      new FakeOwlCardDismissalRepository(),
      new FakeChildRepository(),
      interviewRepo,
      new FakeAssessmentRepository(),
      new RagKiAdapter(),
      new FakeAuditService() as never,
    )
    await service.setSetting('user-1', true)

    await interviewRepo.write({ userId: 'user-1', taxYear: 2024, questionId: 'spenden-betrag', value: 'spaeter', openItems: 0 })
    const resPriorLater = await service.getCards('user-1', 2025, '2025-11-01')
    expect(resPriorLater.cards.some((c) => c.trigger === 'vorjahresvergleich')).toBe(false)

    await interviewRepo.write({ userId: 'user-1', taxYear: 2024, questionId: 'spenden-betrag', value: '300', openItems: 0 })
    await interviewRepo.write({ userId: 'user-1', taxYear: 2025, questionId: 'spenden-betrag', value: 'spaeter', openItems: 0 })
    const resCurrentLater = await service.getCards('user-1', 2025, '2025-11-01')
    expect(resCurrentLater.cards.some((c) => c.trigger === 'vorjahresvergleich')).toBe(true)
  })
})
