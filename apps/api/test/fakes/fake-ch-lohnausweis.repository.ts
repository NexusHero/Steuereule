// In-memory fake for the CH-Lohnausweis repository — the Bescheid service reads it read-only
// (`findForUserAndYear`) to fold the CH line items. Write methods are minimal upserts so the fake
// satisfies the interface; the Bescheid service never calls them (ADR-0004: honour the real
// per-(userId, steuerjahr) one-row contract without a database).
import type { SalaryCertificateAmountFieldId } from '@steuereule/core'
import { EMPTY_N_GRE, type CrossBorderSalaryStatementRecord, type CrossBorderSalaryStatementRepository, type NGreDetails } from '../../src/ch-lohnausweis/ch-lohnausweis.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeChSalaryCertificateRepository implements CrossBorderSalaryStatementRepository {
  private readonly store = new Map<string, CrossBorderSalaryStatementRecord>()

  private leer(userId: string, steuerjahr: number): CrossBorderSalaryStatementRecord {
    return {
      userId,
      steuerjahr,
      fields: {
        lohn: null, gehaltsnebenleistungen: null, 'unregelmaessige-leistungen': null, kapitalleistungen: null,
        beteiligungsrechte: null, sitzungsgelder: null, 'andere-leistungen': null, 'bruttolohn-total': null,
        'ahv-beitraege': null, 'berufliche-vorsorge': null, nettolohn: null, quellensteuer: null,
        spesen: null, 'weitere-nebenleistungen': null,
      },
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      wechselkursMonat: null,
      wechselkursKurs: null,
      wechselkursModus: null,
      wechselkursBelegId: null,
      nGre: EMPTY_N_GRE,
    }
  }

  findForUserAndYear(userId: string, steuerjahr: number): Promise<CrossBorderSalaryStatementRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setField(userId: string, steuerjahr: number, field: SalaryCertificateAmountFieldId, value: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, fields: { ...existing.fields, [field]: value } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setRemarks(userId: string, steuerjahr: number, text: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, bemerkungen: text }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setProvision(userId: string, steuerjahr: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, saeule3aChf, krankenkasseChf }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setNGre(userId: string, steuerjahr: number, details: Partial<NGreDetails>): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, nGre: { ...existing.nGre, ...details } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setExchangeRate(userId: string, steuerjahr: number, exchangeRate: { month: string; rate: number; mode: string; receiptId?: string }): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = {
      ...existing,
      wechselkursMonat: exchangeRate.month,
      wechselkursKurs: exchangeRate.rate,
      wechselkursModus: exchangeRate.mode,
      wechselkursBelegId: exchangeRate.receiptId ?? null,
    }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: CrossBorderSalaryStatementRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
