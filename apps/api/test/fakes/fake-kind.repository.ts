import type { KindRecord, KindRepository } from '../../src/kinder/kind.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeKindRepository implements KindRepository {
  private readonly store = new Map<string, KindRecord>()
  private counter = 0

  listForUserAndYear(userId: string, steuerjahr: number): Promise<KindRecord[]> {
    const k = key(userId, steuerjahr)
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => key(r.userId, r.steuerjahr) === k)
        .sort((a, b) => a.lfdNr - b.lfdNr),
    )
  }

  create(
    userId: string,
    steuerjahr: number,
    data: {
      vorname: string
      nachname: string
      geburtsdatum: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    },
  ): Promise<KindRecord> {
    this.counter += 1
    const current = [...this.store.values()].filter((r) => key(r.userId, r.steuerjahr) === key(userId, steuerjahr))
    const record: KindRecord = {
      id: `fake-kind-${this.counter}`,
      userId,
      steuerjahr,
      lfdNr: current.length + 1,
      vorname: data.vorname,
      nachname: data.nachname,
      geburtsdatum: data.geburtsdatum,
      idnr: data.idnr ?? null,
      kindergeldAnspruchEur: data.kindergeldAnspruchEur ?? null,
    }
    this.store.set(record.id, record)
    return Promise.resolve(record)
  }

  update(
    userId: string,
    steuerjahr: number,
    id: string,
    data: {
      vorname?: string
      nachname?: string
      geburtsdatum?: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    },
  ): Promise<KindRecord | null> {
    const record = this.store.get(id)
    if (!record || record.userId !== userId || record.steuerjahr !== steuerjahr) return Promise.resolve(null)
    const updated: KindRecord = {
      ...record,
      ...(data.vorname !== undefined && { vorname: data.vorname }),
      ...(data.nachname !== undefined && { nachname: data.nachname }),
      ...(data.geburtsdatum !== undefined && { geburtsdatum: data.geburtsdatum }),
      ...(data.idnr !== undefined && { idnr: data.idnr }),
      ...(data.kindergeldAnspruchEur !== undefined && { kindergeldAnspruchEur: data.kindergeldAnspruchEur }),
    }
    this.store.set(id, updated)
    return Promise.resolve(updated)
  }

  delete(userId: string, steuerjahr: number, id: string): Promise<boolean> {
    const record = this.store.get(id)
    if (!record || record.userId !== userId || record.steuerjahr !== steuerjahr) return Promise.resolve(false)
    this.store.delete(id)
    return Promise.resolve(true)
  }
}
