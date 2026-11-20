// The made-up self-employed household of the demo seed (ADR-0101), as pure use of the BusinessService so
// a unit test can run it against in-memory repositories and the seed against the database alike.
import type { BookingDraft } from '@steuereule/core'
import type { BusinessPerson, BusinessRepository } from './business.repository.js'
import type { BusinessService } from './business.service.js'

const euros = (amount: number): number => Math.round(amount * 100)

/** One sale or cost against the bank, gross, with the VAT key (the ledger splits it). */
function cash(date: string, documentNumber: string, text: string, account: string, bank: string, gross: number, taxKey: string, side: 'in' | 'out'): BookingDraft {
  const amount = euros(gross)
  return {
    date,
    documentNumber,
    text,
    lines:
      side === 'in'
        ? [{ account: bank, side: 'debit', amount }, { account, side: 'credit', amount, taxKey: taxKey as never }]
        : [{ account, side: 'debit', amount, taxKey: taxKey as never }, { account: bank, side: 'credit', amount }],
  }
}

// SKR03 (A): 1200 Bank, 8400 Erlöse 19 %, 4930 Bürobedarf, 4920 Telefon, 4940 Fachliteratur, 4945 Fortbildung, 0420 Büroeinrichtung.
function freelancerYear(year: number): BookingDraft[] {
  const fees = year === 2024 ? [7_140, 8_330, 9_520, 6_545, 10_710, 8_925] : [9_520, 10_115, 11_305, 8_330, 12_495, 9_758]
  return [
    ...fees.map((gross, i) => cash(`${year}-${String(2 * i + 1).padStart(2, '0')}-15`, `RE-${year}-${String(i + 1).padStart(3, '0')}`, `Übersetzung Auftrag ${i + 1}`, '8400', '1200', gross, 'ust19', 'in')),
    cash(`${year}-02-03`, `Q-${year}-01`, 'Büromaterial', '4930', '1200', 178.5, 'vst19', 'out'),
    cash(`${year}-04-10`, `Q-${year}-02`, 'Fachwörterbücher', '4940', '1200', 128.4, 'vst7', 'out'),
    cash(`${year}-06-30`, `Q-${year}-03`, 'Mobilfunk Halbjahr', '4920', '1200', 285.6, 'vst19', 'out'),
    cash(`${year}-09-20`, `Q-${year}-04`, 'Seminar Fachübersetzen', '4945', '1200', 595, 'vst19', 'out'),
  ]
}

// SKR04 (B): 1800 Bank, 4400 Erlöse 19 %, 5400 Wareneingang 19 %, 6815 Bürobedarf, 6600 Werbung.
function tradeYear(year: number): BookingDraft[] {
  if (year === 2024) {
    return [
      cash('2024-03-01', 'WE-2024-01', 'Wareneinkauf Startsortiment', '5400', '1800', 35_700, 'vst19', 'out'),
      cash('2024-05-15', 'AR-2024-01', 'Onlineverkäufe Mai', '4400', '1800', 9_520, 'ust19', 'in'),
      cash('2024-08-15', 'AR-2024-02', 'Onlineverkäufe August', '4400', '1800', 11_900, 'ust19', 'in'),
      cash('2024-10-01', 'WB-2024-01', 'Werbung Suchmaschine', '6600', '1800', 4_760, 'vst19', 'out'),
      cash('2024-11-20', 'AR-2024-03', 'Onlineverkäufe November', '4400', '1800', 7_140, 'ust19', 'in'),
    ]
  }
  return [
    cash('2025-02-01', 'WE-2025-01', 'Wareneinkauf Frühjahr', '5400', '1800', 23_800, 'vst19', 'out'),
    cash('2025-04-15', 'AR-2025-01', 'Onlineverkäufe 1. Quartal', '4400', '1800', 41_650, 'ust19', 'in'),
    cash('2025-07-15', 'AR-2025-02', 'Onlineverkäufe 2. Quartal', '4400', '1800', 47_600, 'ust19', 'in'),
    cash('2025-09-01', 'WE-2025-02', 'Wareneinkauf Herbst', '5400', '1800', 17_850, 'vst19', 'out'),
    cash('2025-10-15', 'AR-2025-03', 'Onlineverkäufe 3. Quartal', '4400', '1800', 53_550, 'ust19', 'in'),
    cash('2025-12-10', 'WB-2025-01', 'Werbung Weihnachtsgeschäft', '6600', '1800', 3_570, 'vst19', 'out'),
  ]
}

async function bookOnce(business: BusinessService, repository: BusinessRepository, userId: string, year: number, person: BusinessPerson, drafts: readonly BookingDraft[]): Promise<number> {
  const book = await repository.loadBook(userId, year, person)
  if (book !== null && book.ledger.entries.length > 0) return 0
  for (const draft of drafts) await business.post(userId, year, person, draft)
  return drafts.length
}

/** The interview answers of the household: A self-employed, married, B without a job of her own. */
export const DEMO_ANSWERS: Readonly<Record<string, string>> = { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet', 'partner-job': 'Nicht berufstätig' }

export const DEMO_YEARS = [2024, 2025] as const

/**
 * Fills the books of the demo household through the service (numbers, VAT lines, hash chain as the app
 * writes them). The interview answers must already be stored. Returns the 2024 loss of the Gewerbe.
 */
export async function seedDemoHousehold(business: BusinessService, repository: BusinessRepository, userId: string): Promise<{ loss2024Eur: number }> {
  for (const year of DEMO_YEARS) {

    await business.saveProfile(userId, year, 'A', {
      name: 'Übersetzungsbüro Muster',
      professionAnswers: { priorAssessment: 'freiberuf', freeActivity: 'schriftstellerisch', ownExpertWork: true, employsQualifiedStaff: false, leadsPersonally: true, tradesGoods: false },
      confirmedKind: 'freiberuf',
      mode: 'euer',
      chart: 'SKR03',
      smallBusiness: false,
      vatMethod: 'ist',
      startDate: '2021-04-01',
      vatPrepaymentsCents: euros(year === 2024 ? 7_200 : 8_400),
    })
    await business.saveProfile(userId, year, 'B', {
      name: 'Beispiel Onlinehandel',
      professionAnswers: { priorAssessment: null, ownExpertWork: false, employsQualifiedStaff: false, leadsPersonally: true, tradesGoods: true },
      confirmedKind: 'gewerbe',
      mode: 'bilanz',
      chart: 'SKR04',
      smallBusiness: false,
      vatMethod: 'soll',
      municipalityAgs: '14713000',
      startDate: '2024-03-01',
      vatPrepaymentsCents: euros(year === 2024 ? 0 : 12_000),
      tradeTaxInputs: { financing: { rentImmovableEur: 9_600 } },
      ...(year === 2025 ? { lossFacts: { carriedForwardEur: 0 } } : {}),
    })

    const a = await bookOnce(business, repository, userId, year, 'A', freelancerYear(year))
    if (a > 0 && year === 2024) {
      // An asset with its depreciation by the official table (computer hardware: one year).
      await business.post(userId, year, 'A', { ...cash('2024-03-14', 'RE-IT-0042', 'Notebook', '0420', '1200', 1_428, 'vst19', 'out'), asset: { label: 'Notebook', method: 'linear', category: 'computer', usefulLifeYears: 1 } })
      await business.bookDepreciation(userId, year, 'A')
    }
    if (year === 2025) {
      // The Eröffnungsbilanz of the Gewerbe from the 2024 closing, before the 2025 bookings.
      const nextBook = await repository.loadBook(userId, 2025, 'B')
      if (nextBook === null || nextBook.ledger.entries.length === 0) await business.carryForward(userId, 2024, 'B')
      const next = await repository.loadBook(userId, 2025, 'B')
      if (next !== null && next.ledger.entries.length === 1) for (const draft of tradeYear(2025)) await business.post(userId, 2025, 'B', draft)
    } else {
      await bookOnce(business, repository, userId, year, 'B', tradeYear(year))
    }
  }

  const loss2024 = await business.closing(userId, 2024, 'B')
  const loss = loss2024.bilanz ? -loss2024.bilanz.incomeStatement.profit / 100 : 0
  if (loss > 0) {
    // The loss of 2024 goes forward: 2025 takes it from the Feststellungsbescheid, the Rücktrag is waived.
    await business.saveProfile(userId, 2024, 'B', { lossFacts: { waiveCarryBack: true } })
    await business.saveProfile(userId, 2025, 'B', { lossFacts: { carriedForwardEur: Math.round(loss) }, tradeTaxInputs: { financing: { rentImmovableEur: 9_600 }, lossCarriedForwardEur: Math.round(loss) } })
  }
  return { loss2024Eur: Math.round(loss) }
}

