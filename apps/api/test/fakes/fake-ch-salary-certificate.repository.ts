// In-memory fake for the CH-Lohnausweis repository — the Bescheid service reads it read-only
// (`findForUserAndYear`) to fold the CH line items. Write methods are minimal upserts so the fake
// satisfies the interface; the Bescheid service never calls them (ADR-0004: honour the real
// per-(userId, steuerjahr) one-row contract without a database).
import type { SalaryCertificateAmountFieldId } from '@steuereule/core'
import { EMPTY_N_GRE, type CrossBorderSalaryStatementRecord, type CrossBorderSalaryStatementRepository, type NGreDetails, type ProvisionUpdate } from '../../src/ch-salary-certificate/ch-salary-certificate.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakeChSalaryCertificateRepository implements CrossBorderSalaryStatementRepository {
  private readonly store = new Map<string, CrossBorderSalaryStatementRecord>()

  private leer(userId: string, taxYear: number): CrossBorderSalaryStatementRecord {
    return {
      userId,
      taxYear,
      fields: {
        lohn: null, gehaltsnebenleistungen: null, 'unregelmaessige-leistungen': null, kapitalleistungen: null,
        beteiligungsrechte: null, sitzungsgelder: null, 'andere-leistungen': null, 'bruttolohn-total': null,
        'ahv-beitraege': null, 'berufliche-vorsorge': null, nettolohn: null, quellensteuer: null,
        spesen: null, 'weitere-nebenleistungen': null,
      },
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      exchangeRateMonth: null,
      exchangeRateValue: null,
      exchangeRateMode: null,
      exchangeRateReceiptId: null,
      nGre: EMPTY_N_GRE,
    }
  }

  findForUserAndYear(userId: string, taxYear: number): Promise<CrossBorderSalaryStatementRecord | null> {
    return Promise.resolve(this.store.get(key(userId, taxYear)) ?? null)
  }

  setField(userId: string, taxYear: number, field: SalaryCertificateAmountFieldId, value: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = { ...existing, fields: { ...existing.fields, [field]: value } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setRemarks(userId: string, taxYear: number, text: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = { ...existing, bemerkungen: text }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setProvision(userId: string, taxYear: number, provision: ProvisionUpdate): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = {
      ...existing,
      ...(provision.saeule3aChf === undefined ? {} : { saeule3aChf: provision.saeule3aChf }),
      ...(provision.krankenkasseChf === undefined ? {} : { krankenkasseChf: provision.krankenkasseChf }),
    }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setNGre(userId: string, taxYear: number, details: Partial<NGreDetails>): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = { ...existing, nGre: { ...existing.nGre, ...details } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setExchangeRate(userId: string, taxYear: number, exchangeRate: { month: string | null; rate: number | null; mode: string | null; receiptId?: string }): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = {
      ...existing,
      exchangeRateMonth: exchangeRate.month,
      exchangeRateValue: exchangeRate.rate,
      exchangeRateMode: exchangeRate.mode,
      exchangeRateReceiptId: exchangeRate.receiptId ?? null,
    }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: CrossBorderSalaryStatementRecord): void {
    this.store.set(key(record.userId, record.taxYear), record)
  }
}
