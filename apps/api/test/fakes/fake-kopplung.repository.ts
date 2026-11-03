import type { SteuerjahrKopplungRecord, KopplungRepository } from '../../src/kopplung/kopplung.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeKopplungRepository implements KopplungRepository {
  private readonly store = new Map<string, SteuerjahrKopplungRecord>()
  private counter = 0

  findByUserAndYear(userId: string, steuerjahr: number): Promise<SteuerjahrKopplungRecord | null> {
    for (const r of this.store.values()) {
      if (r.steuerjahr === steuerjahr && (r.personAUserId === userId || r.personBUserId === userId)) {
        return Promise.resolve(r)
      }
    }
    return Promise.resolve(null)
  }

  findByEinladungsCode(code: string): Promise<SteuerjahrKopplungRecord | null> {
    for (const r of this.store.values()) {
      if (r.einladungsCode === code) return Promise.resolve(r)
    }
    return Promise.resolve(null)
  }

  upsert(
    personAUserId: string,
    steuerjahr: number,
    data: {
      personBUserId: string
      veranlagungsart: 'einzel' | 'zusammen'
      einladungsCode?: string | null
    },
  ): Promise<SteuerjahrKopplungRecord> {
    const k = key(personAUserId, steuerjahr)
    const existing = this.store.get(k)
    const id = existing?.id ?? `fake-kopplung-${++this.counter}`
    const record: SteuerjahrKopplungRecord = {
      id,
      personAUserId,
      personBUserId: data.personBUserId,
      steuerjahr,
      veranlagungsart: data.veranlagungsart,
      einladungsCode: data.einladungsCode ?? null,
    }
    this.store.set(k, record)
    return Promise.resolve(record)
  }

  setPersonB(id: string, personBUserId: string): Promise<SteuerjahrKopplungRecord> {
    for (const [k, r] of this.store.entries()) {
      if (r.id === id) {
        const updated = { ...r, personBUserId, einladungsCode: null }
        this.store.set(k, updated)
        return Promise.resolve(updated)
      }
    }
    throw new Error('Not found')
  }

  delete(personAUserId: string, steuerjahr: number): Promise<boolean> {
    const k = key(personAUserId, steuerjahr)
    const exists = this.store.has(k)
    this.store.delete(k)
    return Promise.resolve(exists)
  }
}
