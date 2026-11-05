import type { KindAngaben, KindRecord, KindRepository } from '../../src/kinder/kind.repository.js'

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
    } & Partial<KindAngaben>,
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
      kindschaftsverhaeltnis: data.kindschaftsverhaeltnis ?? null,
      kindschaftsverhaeltnisB: data.kindschaftsverhaeltnisB ?? null,
      familienkasse: data.familienkasse ?? null,
      wohnsitzInlandGanzjaehrig: data.wohnsitzInlandGanzjaehrig ?? null,
      andererElternteil: data.andererElternteil ?? null,
      andererElternteilName: data.andererElternteilName ?? null,
      andererElternteilGeburtsdatum: data.andererElternteilGeburtsdatum ?? null,
      andererElternteilAdresse: data.andererElternteilAdresse ?? null,
      andererElternteilArt: data.andererElternteilArt ?? null,
      andererElternteilVerstorbenAm: data.andererElternteilVerstorbenAm ?? null,
      gemeldetBeiMirGanzjaehrig: data.gemeldetBeiMirGanzjaehrig ?? null,
      kindergeldAnMichGanzjaehrig: data.kindergeldAnMichGanzjaehrig ?? null,
      kvBasisEur: data.kvBasisEur ?? null,
      pvEur: data.pvEur ?? null,
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
    } & Partial<KindAngaben>,
  ): Promise<KindRecord | null> {
    const record = this.store.get(id)
    if (!record || record.userId !== userId || record.steuerjahr !== steuerjahr) return Promise.resolve(null)
    const angaben = Object.fromEntries(Object.entries(data).filter(([, wert]) => wert !== undefined))
    const updated: KindRecord = { ...record, ...angaben }
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
