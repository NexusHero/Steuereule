// In-memory fake for the CH-Lohnausweis repository — the Bescheid service reads it read-only
// (`findForUserAndYear`) to fold the CH line items. Write methods are minimal upserts so the fake
// satisfies the interface; the Bescheid service never calls them (ADR-0004: honour the real
// per-(userId, steuerjahr) one-row contract without a database).
import type { LohnausweisBetragFeldId } from '@steuereule/core'
import { LEERE_N_GRE, type CrossBorderSalaryStatementRecord, type CrossBorderSalaryStatementRepository, type NGreAngaben } from '../../src/ch-lohnausweis/ch-lohnausweis.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeChLohnausweisRepository implements CrossBorderSalaryStatementRepository {
  private readonly store = new Map<string, CrossBorderSalaryStatementRecord>()

  private leer(userId: string, steuerjahr: number): CrossBorderSalaryStatementRecord {
    return {
      userId,
      steuerjahr,
      felder: {
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
      nGre: LEERE_N_GRE,
    }
  }

  findForUserAndYear(userId: string, steuerjahr: number): Promise<CrossBorderSalaryStatementRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setFeld(userId: string, steuerjahr: number, feld: LohnausweisBetragFeldId, wert: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, felder: { ...existing.felder, [feld]: wert } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setBemerkungen(userId: string, steuerjahr: number, text: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, bemerkungen: text }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setVorsorge(userId: string, steuerjahr: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, saeule3aChf, krankenkasseChf }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setNGre(userId: string, steuerjahr: number, angaben: Partial<NGreAngaben>): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, nGre: { ...existing.nGre, ...angaben } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setWechselkurs(userId: string, steuerjahr: number, wechselkurs: { monat: string; kurs: number; modus: string; belegId?: string }): Promise<CrossBorderSalaryStatementRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = {
      ...existing,
      wechselkursMonat: wechselkurs.monat,
      wechselkursKurs: wechselkurs.kurs,
      wechselkursModus: wechselkurs.modus,
      wechselkursBelegId: wechselkurs.belegId ?? null,
    }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: CrossBorderSalaryStatementRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
